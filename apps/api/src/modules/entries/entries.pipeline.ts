/**
 * The hybrid parse pipeline: LLM for structure, USDA for numbers, LLM per-100g
 * estimates only as a flagged fallback. Every helper it uses lives in a sibling file;
 * this one is the order they run in.
 */
import { env } from '../../config/index.ts';
import type { EntryKind, ParsedItem, ParseResult, ParseSource } from '../../types/index.ts';
import { mapWithLimit, round1 } from '../../utils/index.ts';
import { getCachedParse, getCachedUsda, setCachedParse, setCachedUsda } from './entries.cache.ts';
import { confidenceLevel, itemConfidence, overallConfidence } from './entries.confidence.ts';
import { callParseLlm } from './entries.llm.ts';
import { validateLlmOutput } from './entries.llm-output.ts';
import { scaleNutrition, toGrams, toMl } from './entries.portion.ts';
import { PROMPT_VERSION } from './entries.versions.ts';
import { searchFood } from './entries.usda.ts';
import type { LlmParse, ParseDeps, ParseOutcome, SearchUsdaFood, UsdaMatch } from './entries.types.ts';

/**
 * How many USDA lookups may be in flight at once. High enough that a normal row
 * resolves in one wave, low enough that a busy server cannot flood the API.
 */
const USDA_CONCURRENCY = 6;

interface FoodLookup {
  match: UsdaMatch | null;
  cacheHit: boolean;
}

/** One food name resolved: from the cache when possible, from USDA otherwise. */
async function resolveFood(
  name: string,
  searchUsda: SearchUsdaFood,
  useCache: boolean,
): Promise<FoodLookup> {
  const cached = useCache ? await getCachedUsda(name) : null;

  if (cached === 'miss') {
    return { match: null, cacheHit: true };
  }

  if (cached !== null) {
    return { match: cached, cacheHit: true };
  }

  const match = await searchUsda(name);

  if (useCache) {
    await setCachedUsda(name, match);
  }

  return { match, cacheHit: false };
}

function rowKind(items: ParsedItem[]): EntryKind {
  // A row is water only when every item is: a meal with a glass of water is food.
  return items.length > 0 && items.every((item) => item.kind === 'water') ? 'water' : 'food';
}

function buildSources(items: ParsedItem[]): ParseSource[] {
  const sources: ParseSource[] = [];
  const seenFdcIds = new Set<number>();
  let hasEstimate = false;

  for (const item of items) {
    if (item.source === 'usda' && item.fdcId !== null && !seenFdcIds.has(item.fdcId)) {
      seenFdcIds.add(item.fdcId);
      sources.push({
        kind: 'usda',
        title: item.matchedDescription ?? item.name,
        fdcId: item.fdcId,
      });
    }

    hasEstimate ||= item.source === 'llm_estimate';
  }

  if (hasEstimate) {
    sources.push({ kind: 'llm', title: `Model estimate (${env.LLM_MODEL})`, fdcId: null });
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

  const hasUsda = items.some((item) => item.source === 'usda');
  const hasEstimate = items.some((item) => item.source === 'llm_estimate');

  if (hasUsda && hasEstimate) {
    return 'mixed';
  }

  return hasEstimate ? 'llm_estimate' : 'usda';
}

/**
 * Runs one composer row through the whole hybrid pipeline: LLM for structure,
 * USDA for numbers, LLM per-100g estimates only as a flagged fallback.
 */
export async function parseRow(rawText: string, deps: ParseDeps = {}): Promise<ParseOutcome> {
  const callLlm = deps.callLlm ?? callParseLlm;
  const searchUsda = deps.searchUsda ?? searchFood;
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

  // Phase 2 — numbers. One lookup per distinct food name, run in parallel: the items
  // are independent of each other, and waiting on USDA is what a parse spends its time
  // on. `USDA_CONCURRENCY` keeps a long row from opening a burst of connections.
  const names = [
    ...new Set(llmParse.items.filter((item) => item.kind !== 'water').map((item) => item.name)),
  ];

  const lookupStartedAt = performance.now();
  const resolved = await mapWithLimit(names, USDA_CONCURRENCY, (name) =>
    resolveFood(name, searchUsda, useCache),
  );
  const lookupMs = Math.round(performance.now() - lookupStartedAt);

  const lookups = new Map(names.map((name, index) => [name, resolved[index]!]));
  const usdaCacheHits = resolved.filter((lookup) => lookup.cacheHit).length;
  const usdaLookups = resolved.length - usdaCacheHits;

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
        fdcId: null,
        matchedDescription: null,
        confidence: itemConfidence(item.confidence, 'water', 0),
      };
    }

    const grams = toGrams(item.quantity, item.unit, item.estimatedGrams);
    const match = lookups.get(item.name)?.match ?? null;

    if (match !== null) {
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        grams,
        ml: null,
        kind: 'food',
        ...scaleNutrition(match.per100g, grams),
        source: 'usda',
        fdcId: match.fdcId,
        matchedDescription: match.description,
        confidence: itemConfidence(item.confidence, 'usda', match.matchScore),
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
      fdcId: null,
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
      usdaLookups,
      usdaCacheHits,
      llmLatencyMs,
      usdaLatencyMs: usdaLookups > 0 ? lookupMs : null,
      totalLatencyMs: Math.round(performance.now() - startedAt),
      promptTokens,
      completionTokens,
      source: traceSource(items, kind),
      confidence,
    },
  };
}
