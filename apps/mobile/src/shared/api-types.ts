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
export type ItemSource = 'usda' | 'llm_estimate' | 'water';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

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
  fdcId: number | null;
  matchedDescription: string | null;
  confidence: number;
}

export interface NutrientTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

export interface ParseSource {
  kind: 'usda' | 'llm';
  title: string;
  fdcId: number | null;
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
