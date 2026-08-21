/**
 * The hybrid parse pipeline: LLM for structure, food databases for numbers, LLM per-100g
 * estimates only as a flagged fallback. Every helper it uses lives in a sibling file;
 * this one is the order they run in.
 */
import { env } from '../../config/index.ts';
import { tracedLookups } from '../../lib/braintrust.ts';
import type { EntryKind, ParsedItem, ParseResult } from '../../types/index.ts';
import { mapWithLimit } from '../../utils/index.ts';
import {
  buildSources,
  describeMatch,
  rowKind,
  sumTotals,
  toCandidate,
} from './entries.assemble.ts';
import { getCachedParse, setCachedParse } from './entries.cache.ts';
import { confidenceLevel, itemConfidence, overallConfidence } from './entries.confidence.ts';
import type { MatchEvidence } from './entries.confidence.ts';
import { callParseLlm } from './entries.llm.ts';
import { resolveFrom, type FoodLookup } from './entries.lookup.ts';
import { validateLlmOutput } from './entries.llm-output.ts';
import { searchOffFood, takeOffSlot } from './entries.off.ts';
import { isGuessedPortion, scaleNutrition, toGrams, toMl } from './entries.portion.ts';
import { energyDisagreement } from './entries.rank.ts';
import { foldTokens } from './entries.text.ts';
import { searchUsdaFood } from './entries.usda.ts';
import { PROMPT_VERSION } from './entries.versions.ts';
import type {
  FoodMatch,
  FoodProvider,
  LlmItem,
  LlmParse,
  ParseDeps,
  ParseOutcome,
  ProviderTrace,
  SearchFood,
} from './entries.types.ts';

/**
 * How many lookups may be in flight at once, per provider. High enough that a normal row
 * resolves in one wave, low enough that a busy server cannot flood either API. Open Food
 * Facts gets the smaller number because it allows only 10 searches a minute per IP.
 */
/** For the two sources that never involve a database row: water, and a model estimate. */
const NO_MATCH_EVIDENCE: MatchEvidence = { margin: 0, disagreement: 0 };

const USDA_CONCURRENCY = 6;
const OFF_CONCURRENCY = 2;

/** One long row must not spend a whole minute of the shared Open Food Facts budget. */
const OFF_MAX_PER_ROW = 4;

/**
 * How far ahead an Open Food Facts match has to rank before it takes a USDA one. The two
 * providers answer different query strings — USDA the generic English name, Open Food
 * Facts the user's own words — so equal ranks are not equal evidence. Ties stay on the
 * lab-measured table.
 */
const OFF_WIN_MARGIN = 0.15;

/**
 * How much better one provider must match its OWN query before that decides the item,
 * ahead of any provenance weight.
 *
 * The weights alone cannot decide this. They run 1 to 3 for USDA against a ceiling of
 * 1.5 for Open Food Facts, so a lab-measured row answering a translated guess used to
 * beat the user's actual product every time: "ülker çikolatalı gofret" resolved to a US
 * gluten-free cookie. Overlap is the one number that says which row is the same FOOD;
 * the weights then say which table to trust when both fit the query equally well.
 */
const OVERLAP_LEAD = 0.15;

/**
 * How close two rows have to finish before the item is marked for review.
 *
 * It sits below `OFF_WIN_MARGIN`: a gap of less than a tenth of a rank point is smaller
 * than the one the ranking itself refuses to decide a provider on, so it is not a gap the
 * parse should quietly settle either. The flag changes no number — it only says which row
 * is worth a person's glance, and `candidates` is what they glance at.
 */
const REVIEW_MARGIN = 0.1;

/**
 * One provider's whole wave, timed on its own. The waves run side by side, so a single
 * clock around both would report the slower one's time under the faster one's name.
 */
async function timedWave<T>(run: () => Promise<T>): Promise<{ resolved: T; ms: number }> {
  const startedAt = performance.now();
  const resolved = await run();

  return { resolved, ms: Math.round(performance.now() - startedAt) };
}

/**
 * What one provider's wave did, counted the same way for every provider. `neverAsked` is
 * the names the wave was never given — an item the pipeline decided was not worth this
 * provider — and it is added to the ones its own rate budget turned away.
 */
function providerTrace(
  provider: FoodProvider,
  wave: { resolved: FoodLookup[]; ms: number },
  neverAsked: number,
): ProviderTrace {
  const cacheHits = wave.resolved.filter((lookup) => lookup.cacheHit).length;
  const skippedByBudget = wave.resolved.filter((lookup) => lookup.skipped).length;
  const lookups = wave.resolved.length - cacheHits - skippedByBudget;

  return {
    provider,
    lookups,
    cacheHits,
    skipped: neverAsked + skippedByBudget,
    // Counted out of the lookups that ran, not subtracted from them: a name that was
    // asked and not answered was still asked, and the latency it cost was real.
    unreachable: wave.resolved.filter((lookup) => lookup.unreachable).length,
    latencyMs: lookups > 0 ? wave.ms : null,
  };
}

/** A row's own slice of the Open Food Facts budget, on top of the per-minute window. */
function rowOffBudget(takeSlot: () => boolean | Promise<boolean>): () => Promise<boolean> {
  let used = 0;

  return async () => {
    // The row's own cap is checked first and costs nothing, so a row that has already had
    // its four names never asks the shared counter about a fifth.
    if (used >= OFF_MAX_PER_ROW || !(await takeSlot())) {
      return false;
    }

    used += 1;

    return true;
  };
}

/**
 * Whether this item is worth one slot of the Open Food Facts budget.
 *
 * Two names that hold the same word mean one of two very different things: an English
 * line ("white rice"), where Open Food Facts would only be searching the string USDA
 * handles better — or a food with no English name at all ("ayran"), which is the single
 * case Open Food Facts exists to answer. The names alone cannot tell them apart, so the
 * line's own language does: on anything not written in English, every food is asked.
 */
function worthOffLookup(item: LlmItem, language: string): boolean {
  if (language !== 'en') {
    return true;
  }

  // An English line still translated this item, so it is a branded product filed under
  // the user's own words rather than under the generic name.
  return foldTokens(item.localName).join(' ') !== foldTokens(item.name).join(' ');
}

/**
 * What a row disagreeing with the model's estimate costs it, per natural log unit past
 * the tolerance `energyDisagreement` allows.
 *
 * This is the pipeline paying attention to a number it already had and used to throw
 * away. The model estimates per-100 g figures for every item so that an unmatched food
 * still gets numbers; on the gold set those estimates land inside the expected band for
 * 25 of the 26 items the ranking got wrong. They are not accurate enough to publish —
 * that is why they are capped at `LLM_ESTIMATE_CONFIDENCE_CAP` when they are all there
 * is — but they are easily accurate enough to say that a 467 kcal row is not yogurt.
 *
 * It has to be worth more than a provider weight, because the rows it separates are
 * frequently identical in every other respect: USDA answers "greek yogurt" with ten
 * Branded rows carrying that exact description and energies from 65 to 467. No amount of
 * reading the words can order those, and the words are all the ranking had.
 */
const IMPLAUSIBILITY_WEIGHT = 1;

/** The row's rank once the model's estimate has had its say. */
function plausibleRank(match: FoodMatch, estimateKcal: number): number {
  return match.rank - IMPLAUSIBILITY_WEIGHT * energyDisagreement(match.per100g.kcal, estimateKcal);
}

/**
 * How many losing rows are kept on the item. Three is what a picker can show without
 * becoming a database browser, and every one of them is stored in the entry's jsonb on
 * every row forever — the fourth-best match is not worth that.
 */
const CANDIDATES_KEPT = 3;

/** The row this item is priced from, and how clear-cut that choice was. */
interface Choice {
  match: FoodMatch | null;
  /**
   * How far ahead of the runner-up the winner finished, in rank units. `Infinity` when
   * there was no runner-up, which is the clearest possible answer: exactly one row in
   * either database could be this food.
   */
  margin: number;
  /** How far the winning row's energy sat from the model's estimate. See the confidence. */
  disagreement: number;
  /**
   * The rows that lost, best first: no duplicate of the winner, no two of each other. They
   * are what the correction loop offers when the winner is the wrong food, which is why
   * they are carried out of here instead of being dropped with the rest of the list.
   */
  alternates: FoodMatch[];
}

/**
 * The row this item is priced from, out of everything both providers offered.
 *
 * Fit first, provenance second: a row that clearly answers its own query better is the
 * one that names the right food, whichever table it came from. Only when neither row
 * fits better does the provider weight decide, and there lab data wins a tie — see
 * `OFF_WIN_MARGIN` for why a tie there is not really a tie.
 *
 * The margin comes back with the winner because it is the one thing here that says how
 * much the choice was worth. A row that finished half a point clear of everything else
 * was identified; a row that finished a hundredth clear of a rival was guessed between,
 * and the score the user sees should not read the same in both cases.
 */
function chooseMatch(
  usda: readonly FoodMatch[],
  off: readonly FoodMatch[],
  estimateKcal: number,
): Choice {
  const scored = [...usda, ...off]
    .map((match) => ({ match, score: plausibleRank(match, estimateKcal) }))
    .sort((a, b) => b.score - a.score);

  const bestOf = (candidates: readonly FoodMatch[]): FoodMatch | null =>
    scored.find((entry) => candidates.includes(entry.match))?.match ?? null;

  const bestUsda = bestOf(usda);
  const bestOff = bestOf(off);

  const winner = ((): FoodMatch | null => {
    if (bestOff === null) {
      return bestUsda;
    }

    if (bestUsda === null) {
      return bestOff;
    }

    if (bestOff.matchScore > bestUsda.matchScore + OVERLAP_LEAD) {
      return bestOff;
    }

    if (bestUsda.matchScore > bestOff.matchScore + OVERLAP_LEAD) {
      return bestUsda;
    }

    return plausibleRank(bestOff, estimateKcal) >
      plausibleRank(bestUsda, estimateKcal) + OFF_WIN_MARGIN
      ? bestOff
      : bestUsda;
  })();

  if (winner === null) {
    return { match: null, margin: 0, disagreement: 0, alternates: [] };
  }

  // The margin is measured against the best row that is not the winner and is not a
  // duplicate of it: the same product listed twice is not a rival, and counting it as one
  // would report every common food as ambiguous.
  const runnerUp = scored.find(
    (entry) => entry.match !== winner && entry.match.description !== winner.description,
  );

  // The list a person picks from is deduped by a different rule, and the difference matters.
  // USDA answers "greek yogurt" with ten Branded rows carrying that exact description and
  // energies from 65 to 467 kcal per 100 g. To the margin those are one row seen ten times,
  // which is right — nothing about the words separates them. To a person choosing, they are
  // ten different foods, and the description-only rule would offer them nothing at all on
  // precisely the item most likely to be wrong. So a row is a duplicate here only when its
  // energy matches too.
  const seen = new Set<string>([`${winner.description}|${Math.round(winner.per100g.kcal)}`]);
  const alternates = scored.filter((entry) => {
    const key = `${entry.match.description}|${Math.round(entry.match.per100g.kcal)}`;

    if (entry.match === winner || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });

  return {
    match: winner,
    // Floored at zero. The cross-provider rules above can hand the row to a match that is
    // not the top-scoring one — that is their whole job — and the arithmetic would then
    // report a negative lead, which is not a thing a margin can be. A winner that did not
    // outscore the field is simply one that was not decisive.
    margin:
      runnerUp === undefined
        ? Infinity
        : Math.max(0, plausibleRank(winner, estimateKcal) - runnerUp.score),
    disagreement: energyDisagreement(winner.per100g.kcal, estimateKcal),
    alternates: alternates.slice(0, CANDIDATES_KEPT).map((entry) => entry.match),
  };
}

function traceSource(items: ParsedItem[], kind: EntryKind): string | null {
  if (items.length === 0) {
    return null;
  }

  if (kind === 'water') {
    return 'water';
  }

  const sources = new Set(items.filter((item) => item.kind !== 'water').map((item) => item.source));

  if (sources.size === 0) {
    return null;
  }

  return sources.size > 1 ? 'mixed' : [...sources][0]!;
}

/**
 * Runs one composer row through the whole hybrid pipeline: LLM for structure, the food
 * databases for numbers, LLM per-100g estimates only as a flagged fallback.
 */
export async function parseRow(rawText: string, deps: ParseDeps = {}): Promise<ParseOutcome> {
  const callLlm = deps.callLlm ?? callParseLlm;
  const searchUsda = deps.searchUsda ?? searchUsdaFood;
  const searchOff = deps.searchOff ?? searchOffFood;
  const takeSlot = rowOffBudget(deps.takeOffSlot ?? takeOffSlot);
  const offEnabled = deps.offEnabled ?? env.OFF_ENABLED;
  const useCache = deps.useCache ?? true;

  const startedAt = performance.now();

  // Phase 1 — structure. The cache means one exact line is only ever paid for once.
  let llmParse: LlmParse | null = useCache ? await getCachedParse(rawText) : null;
  const llmCacheHit = llmParse !== null;
  let llmLatencyMs: number | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;

  if (llmParse === null) {
    const llmStartedAt = performance.now();
    const call = await callLlm(rawText);
    llmLatencyMs = Math.round(performance.now() - llmStartedAt);
    promptTokens = call.promptTokens;
    completionTokens = call.completionTokens;
    llmParse = validateLlmOutput(call.raw);

    // Stored only once it has validated: a generation the pipeline could not read is not
    // one worth serving back for a week.
    if (useCache) {
      await setCachedParse(rawText, call.raw);
    }
  }

  // Phase 2 — numbers. Each provider gets its own wave over its own query strings, and
  // the two waves run side by side: nesting them would make USDA queue behind the much
  // narrower Open Food Facts lane, and a row would cost the sum instead of the larger.
  // With Open Food Facts switched off its wave is empty and it leaves no trace row: a
  // provider that was never in play is not one that "skipped" anything.
  const language = llmParse.language;
  const foodItems = llmParse.items.filter((item) => item.kind !== 'water');
  const usdaNames = [...new Set(foodItems.map((item) => item.name))];
  const localNames = [...new Set(foodItems.map((item) => item.localName))];
  const offNames = offEnabled
    ? [
        ...new Set(
          foodItems.filter((item) => worthOffLookup(item, language)).map((item) => item.localName),
        ),
      ]
    : [];

  // Each wave is also its own span, so a trace shows the two lanes side by side with the
  // counts that explain them. `neverAsked` is not known until below, so the span reports
  // only what the wave itself did — every name it was actually handed.
  const [usdaWave, offWave] = await Promise.all([
    tracedLookups(
      'usda',
      usdaNames,
      () =>
        timedWave(() =>
          mapWithLimit(usdaNames, USDA_CONCURRENCY, (name) =>
            resolveFrom('usda', name, language, searchUsda, useCache),
          ),
        ),
      (wave) => providerTrace('usda', wave, 0),
    ),
    tracedLookups(
      'off',
      offNames,
      () =>
        timedWave(() =>
          mapWithLimit(offNames, OFF_CONCURRENCY, (name) =>
            resolveFrom('off', name, language, searchOff, useCache, takeSlot),
          ),
        ),
      // A wave that was never in play leaves no span content, the same way it leaves no
      // `parse_trace_lookups` row.
      (wave) => (offEnabled ? providerTrace('off', wave, localNames.length - offNames.length) : null),
    ),
  ]);

  const usdaByName = new Map(usdaNames.map((name, index) => [name, usdaWave.resolved[index]!]));
  const offByName = new Map(offNames.map((name, index) => [name, offWave.resolved[index]!]));

  // Every food name reaches USDA, so the only names it is never asked about are none.
  const providers: ProviderTrace[] = [providerTrace('usda', usdaWave, 0)];

  if (offEnabled) {
    providers.push(providerTrace('off', offWave, localNames.length - offNames.length));
  }

  const items: ParsedItem[] = llmParse.items.map((item) => {
    if (item.kind === 'water') {
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        grams: null,
        ml: toMl(item.quantity, item.unit, item.estimatedGrams),
        kind: 'water',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: 'water',
        sourceId: null,
        matchedDescription: null,
        confidence: itemConfidence(item.confidence, 'water', 0, NO_MATCH_EVIDENCE),
        // Water has one composition and no database is asked for it, so there is nothing
        // to pick between. Only the volume can be wrong.
        per100g: null,
        candidates: [],
        needsReview: isGuessedPortion(item.unit, item.estimatedGrams),
        corrected: false,
      };
    }

    const grams = toGrams(item.quantity, item.unit, item.estimatedGrams);
    const guessedPortion = isGuessedPortion(item.unit, item.estimatedGrams);
    const choice = chooseMatch(
      usdaByName.get(item.name)?.candidates ?? [],
      offByName.get(item.localName)?.candidates ?? [],
      item.per100g.kcal,
    );
    const match = choice.match;

    if (match !== null) {
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        grams,
        ml: null,
        kind: 'food',
        ...scaleNutrition(match.per100g, grams),
        source: match.provider,
        sourceId: match.id,
        matchedDescription: describeMatch(toCandidate(match)),
        confidence: itemConfidence(item.confidence, match.provider, match.matchScore, choice),
        per100g: match.per100g,
        candidates: choice.alternates.map(toCandidate),
        // Two questions, one flag: is this the right row, and is that the right weight.
        needsReview: choice.margin < REVIEW_MARGIN || guessedPortion,
        corrected: false,
      };
    }

    return {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      grams,
      ml: null,
      kind: 'food',
      ...scaleNutrition(item.per100g, grams),
      source: 'llm_estimate',
      sourceId: null,
      matchedDescription: null,
      confidence: itemConfidence(item.confidence, 'llm_estimate', 0, NO_MATCH_EVIDENCE),
      per100g: item.per100g,
      // Nothing outranked anything: no database held this food. The item rests entirely on
      // a model guess, which is the strongest reason there is to ask a person.
      candidates: [],
      needsReview: true,
      corrected: false,
    };
  });

  // Phase 3 — assembly.
  const kind = rowKind(items);
  const confidence = items.length === 0 ? llmParse.confidence : overallConfidence(items);

  const result: ParseResult = {
    kind,
    normalizedText: llmParse.normalizedText === '' ? rawText : llmParse.normalizedText,
    reasoning: llmParse.reasoning,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    items,
    totals: sumTotals(items),
    sources: buildSources(items),
  };

  return {
    result,
    trace: {
      model: env.LLM_MODEL,
      promptVersion: PROMPT_VERSION,
      llmCacheHit,
      providers,
      llmLatencyMs,
      totalLatencyMs: Math.round(performance.now() - startedAt),
      promptTokens,
      completionTokens,
      source: traceSource(items, kind),
      confidence,
    },
  };
}
