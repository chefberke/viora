/**
 * Every contract the entries pipeline speaks in. The shapes the API returns live in
 * `src/types` because the DB schema and the client mirror them; the shapes below never
 * leave this module, so they stay next to the code that produces them.
 */
import type { EntryKind, Nutrition100g, ParseResult } from '../../types/index.ts';

/**
 * Re-exported so the pipeline's own contracts read from one file. It lives in
 * `src/types/parse.ts` because `ParsedItem` carries one — see the field's comment there.
 */
export type { Nutrition100g };

/** One item as the model returned it: structure and portions, no final numbers yet. */
export interface LlmItem {
  /** Generic English name. This is what the USDA table is searched with. */
  name: string;
  /**
   * The words the user actually typed for this item. Open Food Facts is searched with
   * it, because its rows are indexed under the local name a product is sold as. Equal to
   * `name` when the item has no English generic name, or when the line was English.
   */
  localName: string;
  quantity: number;
  unit: string;
  /** The model's total-weight estimate, or `null` when it gave none. */
  estimatedGrams: number | null;
  /** Fallback figures, used only when no food database has a match. */
  per100g: Nutrition100g;
  kind: EntryKind;
  confidence: number;
}

export interface LlmParse {
  normalizedText: string;
  reasoning: string;
  confidence: number;
  /**
   * ISO 639-1 code of the line as the user wrote it, or `''` when the model gave none.
   * It decides which items are worth an Open Food Facts lookup: on a line that is not
   * English, every food is, including the ones whose two names hold the same word.
   */
  language: string;
  items: LlmItem[];
}

export interface LlmCallResult {
  raw: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

/** The two food databases the pipeline can price a portion from. */
export type FoodProvider = 'usda' | 'off';

/**
 * One database row, in the shape the pipeline compares and stores. Both providers
 * normalize into it, so nothing downstream has to know which table an item came from.
 */
export interface FoodMatch {
  provider: FoodProvider;
  /** The USDA fdcId as a string, or the Open Food Facts barcode. */
  id: string;
  /** What the row is called in its own database. Becomes the reference title. */
  description: string;
  /** The USDA data type, or the Open Food Facts brand line. Provenance detail only. */
  detail: string;
  per100g: Nutrition100g;
  /** 0-1 share of the query's words the row carries. Feeds confidence. */
  matchScore: number;
  /**
   * Provider-weighted quality: how good a row this is, all evidence considered. Lab data
   * outranks crowd-entered label data at equal overlap, which is why this and not
   * `matchScore` is what gets compared across providers.
   *
   * It reaches the item's confidence only through the MARGIN between this row and the
   * best rival — never as a level. A rank is not comparable between two different
   * queries; the gap between two rows answering the SAME query is, and that gap is the
   * thing worth telling a user about.
   */
  rank: number;
}

/**
 * What one food database did for one parse. One of these per provider, so adding a third
 * changes nothing about the shape — see the `parse_trace_lookups` table it is written to.
 */
export interface ProviderTrace {
  provider: FoodProvider;
  /** Names actually put to the database over the network. */
  lookups: number;
  /** Names answered from the cache instead. */
  cacheHits: number;
  /** Names never put to it at all: nothing to gain, or a spent rate budget. */
  skipped: number;
  /**
   * Names this database was asked about and could not answer — a timeout, a refused key,
   * a 5xx. Distinct from a lookup that came back empty, which is an answer.
   *
   * It was already computed per lookup and thrown away here. Without it a provider that
   * has quietly stopped answering is invisible: every item falls back to a flagged
   * estimate, the parse succeeds, and the only trace is an accuracy number drifting down
   * over weeks with nothing to point at.
   */
  unreachable: number;
  /** This provider's own wave, null when it made no call. The waves run side by side. */
  latencyMs: number | null;
}

/** Everything a `parse_traces` row needs, gathered as the pipeline runs. */
export interface TraceDraft {
  model: string;
  promptVersion: string;
  llmCacheHit: boolean;
  /** One entry per food database the parse ran a wave for, in the order they were run. */
  providers: ProviderTrace[];
  llmLatencyMs: number | null;
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

/**
 * Every provider has this shape, and none of them may throw: `mapWithLimit` rejects.
 * `language` is the line's ISO 639-1 code; a provider that indexes by language uses it,
 * USDA ignores it.
 *
 * It answers with a RANKED LIST rather than a winner, because text ranking alone cannot
 * finish the job. Ten USDA rows called exactly "GREEK YOGURT" run from 65 to 467 kcal per
 * 100 g and share one description, so nothing about their words separates them. The
 * pipeline holds a piece of evidence the provider does not — the model's own per-100 g
 * estimate for the item — and that is what picks between rows the words tie.
 *
 * Null and `[]` are different answers, and the difference is what a cache turns on: `[]`
 * means the provider looked and holds nothing, null means it could not be reached. Only
 * the first may ever be written down.
 */
export type SearchFood = (query: string, language: string) => Promise<FoodMatch[] | null>;

/** Injection points so evals and tests can run the pipeline without the network. */
export interface ParseDeps {
  callLlm?: CallParseLlm;
  searchUsda?: SearchFood;
  searchOff?: SearchFood;
  /** The Open Food Facts rate budget. Stubbed, a row's own cap can be checked on its own. */
  /**
   * Sync or async. The real budget goes to a shared counter and returns a promise; every
   * stub in `eval/` and `scripts/` is a plain `() => true`, and keeping both shapes here
   * means the shared counter cost those files nothing.
   */
  takeOffSlot?: () => boolean | Promise<boolean>;
  /** Whether Open Food Facts is asked at all. Defaults to `OFF_ENABLED`. */
  offEnabled?: boolean;
  useCache?: boolean;
}
