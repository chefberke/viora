/**
 * The hybrid parse pipeline: LLM for structure, food databases for numbers, LLM per-100g
 * estimates only as a flagged fallback. Every helper it uses lives in a sibling file;
 * this one is the order they run in.
 */
import { env } from '../../config/index.ts';
import type { EntryKind, ParsedItem, ParseResult, ParseSource } from '../../types/index.ts';
import { mapWithLimit, round1 } from '../../utils/index.ts';
import { getCachedFood, getCachedParse, setCachedFood, setCachedParse } from './entries.cache.ts';
import { confidenceLevel, itemConfidence, overallConfidence } from './entries.confidence.ts';
import { callParseLlm } from './entries.llm.ts';
import { validateLlmOutput } from './entries.llm-output.ts';
import { searchOffFood, takeOffSlot } from './entries.off.ts';
import { scaleNutrition, toGrams, toMl } from './entries.portion.ts';
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

interface FoodLookup {
  match: FoodMatch | null;
  cacheHit: boolean;
  /**
   * True when the rate budget stopped the call before it was made. It is not an answer,
   * so it is never written to the cache: doing so would blacklist the food for a day.
   */
  skipped: boolean;
}

/**
 * One name resolved against one provider: from the cache when possible. `language` is
 * part of the cache key only for a provider whose answer depends on it.
 */
async function resolveFrom(
  provider: FoodProvider,
  query: string,
  language: string,
  search: SearchFood,
  useCache: boolean,
  takeSlot?: () => boolean,
): Promise<FoodLookup> {
  const scope = provider === 'off' ? language : '';
  const cached = useCache ? await getCachedFood(provider, query, scope) : null;

  if (cached === 'miss') {
    return { match: null, cacheHit: true, skipped: false };
  }

  if (cached !== null) {
    return { match: cached, cacheHit: true, skipped: false };
  }

  // Checked after the cache, so a name we already know costs no budget.
  if (takeSlot !== undefined && !takeSlot()) {
    return { match: null, cacheHit: false, skipped: true };
  }

  const match = await search(query, language);

  if (useCache) {
    await setCachedFood(provider, query, match, scope);
  }

  return { match, cacheHit: false, skipped: false };
}

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
    latencyMs: lookups > 0 ? wave.ms : null,
  };
}

/** A row's own slice of the Open Food Facts budget, on top of the per-minute window. */
function rowOffBudget(takeSlot: () => boolean): () => boolean {
  let used = 0;

  return () => {
    if (used >= OFF_MAX_PER_ROW || !takeSlot()) {
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
 * The better of two matches, or whichever one exists.
 *
 * Fit first, provenance second: a row that clearly answers its own query better is the
 * one that names the right food, whichever table it came from. Only when neither row
 * fits better does the provider weight decide, and there lab data wins a tie — see
 * `OFF_WIN_MARGIN` for why a tie there is not really a tie.
 */
function bestMatch(usda: FoodMatch | null, off: FoodMatch | null): FoodMatch | null {
  if (off === null) {
    return usda;
  }

  if (usda === null) {
    return off;
  }

  if (off.matchScore > usda.matchScore + OVERLAP_LEAD) {
    return off;
  }

  if (usda.matchScore > off.matchScore + OVERLAP_LEAD) {
    return usda;
  }

  return off.rank > usda.rank + OFF_WIN_MARGIN ? off : usda;
}

function rowKind(items: ParsedItem[]): EntryKind {
  // A row is water only when every item is: a meal with a glass of water is food.
  return items.length > 0 && items.every((item) => item.kind === 'water') ? 'water' : 'food';
}

function buildSources(items: ParsedItem[]): ParseSource[] {
  const sources: ParseSource[] = [];
  const seen = new Set<string>();
  let hasEstimate = false;

  for (const item of items) {
    // Keyed by provider as well as id: a barcode and an fdcId share no id space.
    if ((item.source === 'usda' || item.source === 'off') && item.sourceId !== null) {
      const key = `${item.source}:${item.sourceId}`;

      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          kind: item.source,
          title: item.matchedDescription ?? item.name,
          sourceId: item.sourceId,
        });
      }
    }

    hasEstimate ||= item.source === 'llm_estimate';
  }

  if (hasEstimate) {
    sources.push({
      kind: 'llm',
      title: `Model estimate (${env.LLM_MODEL})`,
      sourceId: null,
    });
  }

  return sources;
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

    if (useCache) {
      await setCachedParse(rawText, llmParse);
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

  const [usdaWave, offWave] = await Promise.all([
    timedWave(() =>
      mapWithLimit(usdaNames, USDA_CONCURRENCY, (name) =>
        resolveFrom('usda', name, language, searchUsda, useCache),
      ),
    ),
    timedWave(() =>
      mapWithLimit(offNames, OFF_CONCURRENCY, (name) =>
        resolveFrom('off', name, language, searchOff, useCache, takeSlot),
      ),
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
        confidence: itemConfidence(item.confidence, 'water', 0),
      };
    }

    const grams = toGrams(item.quantity, item.unit, item.estimatedGrams);
    const match = bestMatch(
      usdaByName.get(item.name)?.match ?? null,
      offByName.get(item.localName)?.match ?? null,
    );

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
        // The brand is what makes a barcode row recognisable, so it travels with the name.
        matchedDescription:
          match.detail !== '' && match.provider === 'off'
            ? `${match.description} — ${match.detail}`
            : match.description,
        confidence: itemConfidence(item.confidence, match.provider, match.matchScore),
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
      confidence: itemConfidence(item.confidence, 'llm_estimate', 0),
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
    totals: {
      calories: items.reduce((sum, item) => sum + item.calories, 0),
      protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
      carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
      fat: round1(items.reduce((sum, item) => sum + item.fat, 0)),
      waterMl: items.reduce((sum, item) => sum + (item.ml ?? 0), 0),
    },
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
