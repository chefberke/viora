/**
 * Domain types for the parse pipeline. This file imports nothing, on purpose: the DB
 * schema, the auth layer and the API types all lean on it, and a dependency here would
 * close an import cycle that collapses drizzle's inference.
 */

export const ENTRY_STATUSES = ['parsed', 'failed'] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === 'string' && (ENTRY_STATUSES as readonly string[]).includes(value);
}

export const ENTRY_KINDS = ['food', 'water'] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === 'string' && (ENTRY_KINDS as readonly string[]).includes(value);
}

/** Where a parsed item's nutrition figures came from. */
export type ItemSource = 'usda' | 'llm_estimate' | 'water';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ParsedItem {
  /** Canonical food name the parser settled on, e.g. "hamburger". */
  name: string;
  quantity: number;
  unit: string;
  /** Food items carry grams; water items carry ml. The other side is null. */
  grams: number | null;
  ml: number | null;
  kind: EntryKind;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: ItemSource;
  /** USDA FoodData Central id when `source` is 'usda'. */
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

/** The full outcome of one parse, stored on the entry and rendered by the sheets. */
export interface ParseResult {
  kind: EntryKind;
  /** The input with spelling fixed. It is the key meal suggestions are grouped under. */
  normalizedText: string;
  /** The model's own account of how it read the line. */
  reasoning: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  items: ParsedItem[];
  totals: NutrientTotals;
  sources: ParseSource[];
}
