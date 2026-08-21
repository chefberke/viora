/**
 * Record once, replay forever.
 *
 * The eval must produce the same numbers on a laptop with no API keys as it does on the
 * machine that recorded it, and it must not spend the model's daily quota every time
 * someone runs it. So every provider answer is captured to a file the first time and read
 * back from that file afterwards.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **Read-through, not record-then-replay.** Both modes go through the same wrapper;
 *    the recorder simply calls the real provider on a miss and stores what came back. A
 *    run that dies halfway leaves every case it finished already recorded, so the next
 *    run continues instead of starting over.
 * 2. **Two legs, keyed separately.** The model's answer and the food databases' answers
 *    are versioned apart. A change on one side must not throw away the other and re-spend
 *    quota to get an identical string back — that is the single most expensive mistake
 *    this file exists to prevent.
 * 3. **The food leg stores the rows the providers returned, not the row that won.**
 *    Ranking is the part of this system most likely to change, and storing only the
 *    winner would mean every experiment on it costs another pass over the Open Food Facts
 *    budget. Storing the candidates makes a ranking change free to evaluate: the search
 *    is replayed from disk and `pickBestMatch` runs live. It is also what lets the
 *    cassettes answer "what else was on offer?", which the correction loop needs.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../src/config/index.ts';
import { isPipelineError } from '../src/modules/entries/entries.errors.ts';
import { callParseLlm } from '../src/modules/entries/entries.llm.ts';
import { fetchOffHits, rankMatches as rankOffMatches } from '../src/modules/entries/entries.off.ts';
import { fetchUsdaHits, rankMatches as rankUsdaMatches } from '../src/modules/entries/entries.usda.ts';
import { PROMPT_FINGERPRINT, PROMPT_VERSION } from '../src/modules/entries/entries.versions.ts';
import type { FoodMatch, LlmCallResult, ParseDeps } from '../src/modules/entries/entries.types.ts';

export const CASSETTE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'cassettes');

/**
 * Minimum gap between live calls to each provider.
 *
 * Open Food Facts allows 10 searches a minute per IP and the pipeline already holds
 * itself to 8; 7.5 s is that same budget expressed as a gap, which is what a recorder
 * needs since it cannot ask a synchronous budget to wait.
 *
 * The model gap follows whichever provider `LLM_BASE_URL` points at, and the two meter
 * differently. OpenRouter with credit allows 20 requests a minute and 1000 a day, so 4 s
 * is its ceiling with headroom; Groq's free tier meters tokens instead — 8000 a minute
 * against about 2400 per parse — and needs 20 s. The gap is set for OpenRouter because
 * that is what is configured, and the cost of being wrong is bounded rather than fatal:
 * `callLlmPatiently` waits out a 429 instead of failing the run, so a switch back to Groq
 * records more slowly rather than not at all.
 *
 * USDA allows roughly 1000/hour, so 200 ms is courtesy rather than necessity.
 */
const GAP_MS = { llm: 4_000, off: 7_500, usda: 200 };

/**
 * How many ranked rows replay hands the pipeline. It mirrors the providers' own limit so
 * a replayed run sees exactly the shortlist a live one would — the pipeline picks among
 * these using the model's estimate, so handing it a longer or shorter list than
 * production gets would make the eval measure a system nobody runs.
 */
const CANDIDATE_LIMIT = 10;

/**
 * What a 429 from the model costs, and how many times it is worth paying.
 *
 * The gap above is set from the average call, so a run of unusually long answers can
 * still drain the token bucket faster than it refills. That is a stall, not an outage:
 * the bucket is whole again within a minute. Production is right to give up quickly and
 * tell the user, but a recorder that gives up throws away a run that only needed to
 * wait, so here it waits. Four attempts is far longer than any published window; past
 * that the limit is not the per-minute one and stopping is the correct answer.
 */
const RATE_LIMIT_COOLDOWN_MS = 65_000;
const RATE_LIMIT_ATTEMPTS = 4;

function isRateLimited(error: unknown): boolean {
  return isPipelineError(error) && error.code === 'rate_limited';
}

/** One parse call, waiting out a per-minute limit rather than failing the whole run. */
async function callLlmPatiently(rawText: string, caseId: string): Promise<LlmCallResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await callParseLlm(rawText);
    } catch (error) {
      if (!isRateLimited(error) || attempt >= RATE_LIMIT_ATTEMPTS) {
        throw error;
      }

      console.log(
        `  rate limited on ${caseId} — waiting ${RATE_LIMIT_COOLDOWN_MS / 1000}s (attempt ${attempt}/${RATE_LIMIT_ATTEMPTS})`,
      );
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_COOLDOWN_MS));
    }
  }
}

interface LlmLeg {
  key: string;
  raw: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * A recorded search. `[]` means the provider looked and holds nothing, which is an
 * answer; null is never stored, because an outage is not one.
 */
type RecordedHits = Record<string, unknown[]>;

interface FoodLeg {
  key: string;
  /** Query string -> the rows USDA returned, unranked. */
  usda: RecordedHits;
  /** `${language}|${query}` -> rows. Open Food Facts answers depend on the language. */
  off: RecordedHits;
}

interface Cassette {
  caseId: string;
  input: string;
  recordedAt: string;
  /** Only a run that reached the end sets this. A half-written cassette is re-recorded. */
  complete: boolean;
  llm: LlmLeg | null;
  foods: FoodLeg;
}

/** The model leg is stale when the prompt text, its version, or the model changes. */
function llmKey(): string {
  return `${PROMPT_VERSION}.${PROMPT_FINGERPRINT}:${env.LLM_MODEL}`;
}

/**
 * The food leg's own format version. Deliberately not `FOOD_KEY_VERSION`: that marker
 * tracks the *ranking* rules, and the whole point of storing raw rows is that changing
 * the ranking leaves the recording valid. Bump this only when the stored shape changes.
 */
const FOOD_LEG_FORMAT = 'raw-hits.v1';

function foodKey(): string {
  return FOOD_LEG_FORMAT;
}

/**
 * USDA returns every nutrient it knows for every row, which is most of the bytes in a
 * cassette and none of the information. Each nutrient row is reduced to the two fields
 * the reader looks at. Nothing else about the row is touched, so the ranking sees
 * exactly what it would have seen live.
 */
function prune(hits: unknown[]): unknown[] {
  return hits.map((hit) => {
    if (typeof hit !== 'object' || hit === null) {
      return hit;
    }

    const food = hit as Record<string, unknown>;

    if (!Array.isArray(food.foodNutrients)) {
      return food;
    }

    return {
      ...food,
      foodNutrients: food.foodNutrients.map((entry) => {
        const nutrient = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;

        return { nutrientNumber: nutrient.nutrientNumber, value: nutrient.value };
      }),
    };
  });
}

function cassettePath(caseId: string): string {
  return join(CASSETTE_DIR, `${caseId}.json`);
}

export function loadCassette(caseId: string, input: string): Cassette {
  try {
    const parsed = JSON.parse(readFileSync(cassettePath(caseId), 'utf8')) as Cassette;

    return {
      caseId,
      input,
      recordedAt: parsed.recordedAt,
      // A leg whose key no longer matches is dropped here, so every later read is a miss
      // and the recorder refills exactly that leg and no other.
      llm: parsed.llm !== null && parsed.llm.key === llmKey() ? parsed.llm : null,
      // A food leg in an older format is dropped, and the cassette stops counting as
      // complete so the recorder refills it. The model leg beside it survives untouched.
      complete: parsed.complete === true && parsed.foods.key === foodKey(),
      foods:
        parsed.foods.key === foodKey() ? parsed.foods : { key: foodKey(), usda: {}, off: {} },
    };
  } catch {
    return {
      caseId,
      input,
      recordedAt: '',
      complete: false,
      llm: null,
      foods: { key: foodKey(), usda: {}, off: {} },
    };
  }
}

/** Whether this case can be replayed without touching the network. */
export function isReplayable(cassette: Cassette): boolean {
  return cassette.complete && cassette.llm !== null;
}

function save(cassette: Cassette, recordedAt: string): void {
  mkdirSync(CASSETTE_DIR, { recursive: true });

  const path = cassettePath(cassette.caseId);
  const temporary = `${path}.tmp`;
  const sorted: Cassette = {
    ...cassette,
    recordedAt,
    // Sorted so re-recording one query does not reshuffle the file and produce a diff
    // that looks like everything changed.
    foods: {
      key: cassette.foods.key,
      usda: sortKeys(cassette.foods.usda),
      off: sortKeys(cassette.foods.off),
    },
  };

  writeFileSync(temporary, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(temporary, path);
}

function sortKeys(record: RecordedHits): RecordedHits {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Thrown when replay is asked for something no cassette holds. Never caught silently. */
export class CassetteMiss extends Error {
  constructor(what: string) {
    super(`cassette miss: ${what}. Run: npm run eval:record`);
    this.name = 'CassetteMiss';
  }
}

export interface QuotaSpend {
  llm: number;
  usda: number;
  off: number;
}

/** One gate per provider, so a slow lane never delays a fast one. */
function pacer(gapMs: number): () => Promise<void> {
  let previous = 0;

  return async () => {
    const wait = previous === 0 ? 0 : previous + gapMs - Date.now();

    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }

    previous = Date.now();
  };
}

export interface Session {
  /**
   * Deps for one case. `record` decides whether a miss may reach the network; `allowLlm`
   * decides whether the metered one may be reached at all, so the food side can be
   * topped up without spending model quota.
   */
  deps: (cassette: Cassette, record: boolean, allowLlm?: boolean) => ParseDeps;
  finish: (cassette: Cassette, ok: boolean) => void;
  spend: QuotaSpend;
}

/**
 * One eval run's view of the cassette store. The pacers live on the session rather than
 * per case, so a batch of 25 cases shares one rate budget instead of 25.
 */
export function createSession(now: () => string): Session {
  const spend: QuotaSpend = { llm: 0, usda: 0, off: 0 };
  const waitLlm = pacer(GAP_MS.llm);
  const waitUsda = pacer(GAP_MS.usda);
  const waitOff = pacer(GAP_MS.off);

  return {
    spend,

    deps: (cassette, record, allowLlm = true) => ({
      useCache: false,

      // Always granted. The real per-minute budget cannot be asked to wait — it is
      // synchronous — so pacing happens in the async search below instead. The pipeline's
      // own OFF_MAX_PER_ROW cap still applies on top, which is what production does, so a
      // long row records exactly the lookups a real request would have made.
      takeOffSlot: () => true,

      callLlm: async (rawText: string): Promise<LlmCallResult> => {
        if (cassette.llm !== null) {
          return {
            raw: cassette.llm.raw,
            promptTokens: cassette.llm.promptTokens,
            completionTokens: cassette.llm.completionTokens,
          };
        }

        if (!record || !allowLlm) {
          throw new CassetteMiss(`llm for "${cassette.input}"`);
        }

        await waitLlm();
        spend.llm += 1;

        const call = await callLlmPatiently(rawText, cassette.caseId);

        cassette.llm = { key: llmKey(), ...call };

        return call;
      },

      // The search comes from disk; the ranking runs live. That is what makes an
      // experiment on `pickBestMatch` free to evaluate.
      searchUsda: async (query: string): Promise<FoodMatch[] | null> => {
        const stored = cassette.foods.usda[query];

        if (stored !== undefined) {
          return rankUsdaMatches(query, stored, CANDIDATE_LIMIT);
        }

        if (!record) {
          throw new CassetteMiss(`usda "${query}"`);
        }

        await waitUsda();
        spend.usda += 1;

        const hits = await fetchUsdaHits(query);

        // An outage is not an answer, so it is not written down. The next run tries again
        // rather than replaying a permanent, invented miss.
        if (hits === null) {
          return null;
        }

        cassette.foods.usda[query] = prune(hits);

        return rankUsdaMatches(query, hits, CANDIDATE_LIMIT);
      },

      searchOff: async (query: string, language: string): Promise<FoodMatch[] | null> => {
        const key = `${language}|${query}`;
        const stored = cassette.foods.off[key];

        if (stored !== undefined) {
          return rankOffMatches(query, stored, CANDIDATE_LIMIT);
        }

        if (!record) {
          throw new CassetteMiss(`off "${key}"`);
        }

        await waitOff();
        spend.off += 1;

        const hits = await fetchOffHits(query, language);

        if (hits === null) {
          return null;
        }

        cassette.foods.off[key] = hits;

        return rankOffMatches(query, hits, CANDIDATE_LIMIT);
      },
    }),

    // Only a case that got all the way through is marked complete: a cassette written
    // from a half-finished parse would replay as a silent, permanent wrong answer.
    //
    // A failure clears the flag as well as withholding it. Without that, a case that was
    // complete on a previous recording stayed complete while its NEW model answer was
    // unusable, so `isReplayable` said yes and every later run replayed the bad answer
    // instead of asking the recorder to try again. Measured: `2 eggs` came back as an
    // 815-character `{"analysis": "..."}` — the model's own scratchpad wrapped in JSON,
    // with no items in it at all — and that one bad draw would have been baked into every
    // number this harness produced from then on.
    finish: (cassette, ok) => {
      cassette.complete = ok;
      save(cassette, now());
    },
  };
}
