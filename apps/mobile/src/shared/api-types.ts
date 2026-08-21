/**
 * Hand-mirrored from `apps/api/src/types/parse.ts` and `api.ts` — the two apps share no
 * package, so this file is the contract copy. Change the API types first, then this.
 *
 * It sits in `shared/` rather than inside a feature because two features speak to the same
 * API: logging writes entries, saved-meals bookmarks their parses. Keeping the contract in
 * one of them would have the other reaching through a feature barrel for a type.
 */

export type EntryKind = 'food' | 'water';
export type EntryStatus = 'parsed' | 'failed';
export type ItemSource = 'usda' | 'off' | 'llm_estimate' | 'water';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface Nutrition100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** One database row an item could have been priced from: what a correction picks between. */
export interface ItemCandidate {
  provider: 'usda' | 'off';
  id: string;
  description: string;
  /** The USDA data type, or the Open Food Facts brand line. */
  detail: string;
  per100g: Nutrition100g;
}

export interface ParsedItem {
  name: string;
  quantity: number;
  unit: string;
  grams: number | null;
  ml: number | null;
  kind: EntryKind;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: ItemSource;
  /** The matched row's id in its own database: a USDA fdcId or an Open Food Facts barcode. */
  sourceId: string | null;
  matchedDescription: string | null;
  confidence: number;
  /** The 100 g row the numbers were scaled from. What re-prices a corrected portion. */
  per100g: Nutrition100g | null;
  /** The rows that lost, best first, at most three. The choices a correction offers. */
  candidates: ItemCandidate[];
  /** The parse could not settle this row on its own and would like a person to look. */
  needsReview: boolean;
  /** A person set this item's food or portion by hand. */
  corrected: boolean;
}

export interface NutrientTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

export interface ParseSource {
  kind: 'usda' | 'off' | 'llm';
  title: string;
  /** The row's id in its own database. Null for the model's own estimate. */
  sourceId: string | null;
}

export interface ParseResult {
  kind: EntryKind;
  normalizedText: string;
  reasoning: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  items: ParsedItem[];
  totals: NutrientTotals;
  sources: ParseSource[];
}

export interface LogEntryDto {
  id: string;
  day: number;
  minuteOfDay: number | null;
  rawText: string;
  revision: number;
  status: EntryStatus;
  result: ParseResult | null;
  createdAt: string;
  updatedAt: string;
}

/** One edit to one parsed item. `itemIndex` indexes the revision named in the request. */
export type CorrectionOpRequest =
  | { type: 'pick_candidate'; itemIndex: number; candidateIndex: number }
  | { type: 'set_food'; itemIndex: number; food: ItemCandidate }
  | {
      type: 'set_portion';
      itemIndex: number;
      quantity: number;
      unit: string;
      /** An explicit weight, when the client knows one. Otherwise the unit decides. */
      grams?: number | null;
    }
  | { type: 'remove_item'; itemIndex: number }
  | {
      type: 'add_item';
      name: string;
      quantity: number;
      unit: string;
      kind: EntryKind;
      grams?: number | null;
      food?: ItemCandidate | null;
    };

export interface CorrectEntryRequest {
  /** The revision being corrected. A mismatch is a 409, never a silent overwrite. */
  revision: number;
  ops: CorrectionOpRequest[];
}

export interface CorrectEntryResponse {
  entry: LogEntryDto;
}

/** Rows to pick from when none of an item's own candidates were the food. */
export interface FoodSearchResponse {
  foods: ItemCandidate[];
}

export interface UpsertEntryRequest {
  rawText: string;
  day: number;
  revision: number;
  minuteOfDay: number | null;
}

export interface UpsertEntryResponse {
  entry: LogEntryDto;
}

export interface EntriesResponse {
  entries: LogEntryDto[];
}

export interface LoggedDaysResponse {
  days: number[];
}

export interface DeleteEntryResponse {
  deleted: true;
}

export interface SuggestionDto {
  key: string;
  text: string;
  source: 'history' | 'bookmark' | 'both';
  score: number;
}

export interface SuggestionsResponse {
  suggestions: SuggestionDto[];
}

export interface SavedMealDto {
  id: string;
  text: string;
  status: EntryStatus;
  result: ParseResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavedMealsResponse {
  savedMeals: SavedMealDto[];
}

export interface SaveMealRequest {
  text: string;
  result?: ParseResult | null;
  sourceEntryId?: string | null;
}

export interface SaveMealResponse {
  savedMeal: SavedMealDto;
}

export interface DeleteSavedMealResponse {
  deleted: true;
}
