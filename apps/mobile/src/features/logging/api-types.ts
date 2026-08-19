/**
 * Hand-mirrored from `apps/api/src/types/parse.ts` and `api.ts` — the two apps share no
 * package, so this file is the contract copy. Change the API types first, then this.
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
