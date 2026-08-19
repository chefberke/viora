/**
 * Every contract the entries pipeline speaks in. The shapes the API returns live in
 * `src/types` because the DB schema and the client mirror them; the shapes below never
 * leave this module, so they stay next to the code that produces them.
 */
import type { EntryKind, ParseResult } from '../../types/index.ts';

/** Nutrition per 100 g (per 100 ml for liquids) — the unit both USDA and the model report in. */
export interface Nutrition100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One item as the model returned it: structure and portions, no final numbers yet. */
export interface LlmItem {
  name: string;
  quantity: number;
  unit: string;
  /** The model's total-weight estimate, or `null` when it gave none. */
  estimatedGrams: number | null;
  /** Fallback figures, used only when USDA has no match. */
  per100g: Nutrition100g;
  kind: EntryKind;
  confidence: number;
}

export interface LlmParse {
  normalizedText: string;
  reasoning: string;
  confidence: number;
  items: LlmItem[];
}

export interface LlmCallResult {
  raw: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface UsdaMatch {
  fdcId: number;
  description: string;
  dataType: string;
  per100g: Nutrition100g;
  /** 0-1 share of the query's tokens found in the matched description. */
  matchScore: number;
}

/** Everything a `parse_traces` row needs, gathered as the pipeline runs. */
export interface TraceDraft {
  model: string;
  promptVersion: string;
  llmCacheHit: boolean;
  usdaLookups: number;
  usdaCacheHits: number;
  llmLatencyMs: number | null;
  usdaLatencyMs: number | null;
  totalLatencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  source: string | null;
  confidence: number | null;
}

export interface ParseOutcome {
  result: ParseResult;
  trace: TraceDraft;
}

export type CallParseLlm = (rawText: string) => Promise<LlmCallResult>;

export type SearchUsdaFood = (name: string) => Promise<UsdaMatch | null>;

/** Injection points so evals and tests can run the pipeline without the network. */
export interface ParseDeps {
  callLlm?: CallParseLlm;
  searchUsda?: SearchUsdaFood;
  useCache?: boolean;
}
