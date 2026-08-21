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

/**
 * The kinds of correction a person can make to a parsed row.
 *
 * Free text in the column, a union here: a new kind is a deploy, not a migration. Each
 * one is a different STATEMENT about what the parser got wrong, which is the point —
 * "you picked the wrong row for the right food" and "there is no such food in my meal"
 * are both corrections and they teach opposite things.
 */
export const CORRECTION_TYPES = [
  /** The food was right and the database row was not: swap in one of the candidates. */
  'pick_candidate',
  /** The food was right and the weight was not. */
  'set_portion',
  /** The parser invented this item, or it is not worth logging. */
  'remove_item',
  /** The parser missed a food the line named. */
  'add_item',
  /** None of the candidates were the food: a row chosen from a search instead. */
  'set_food',
] as const;

export type CorrectionType = (typeof CORRECTION_TYPES)[number];

export function isCorrectionType(value: unknown): value is CorrectionType {
  return typeof value === 'string' && (CORRECTION_TYPES as readonly string[]).includes(value);
}

/** Where a parsed item's nutrition figures came from. */
export type ItemSource = 'usda' | 'off' | 'llm_estimate' | 'water';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/** Nutrition per 100 g (per 100 ml for liquids) — the unit every food source reports in. */
export interface Nutrition100g {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * One database row an item could have been priced from, in the smallest shape a correction
 * needs: enough to show a person what they are choosing between, and enough to re-price the
 * portion from it without asking any database again.
 *
 * The ranking figures a `FoodMatch` carries are deliberately left out. `matchScore` and
 * `rank` order one query's rows against each other and mean nothing to a reader; storing
 * them would put three more numbers in every jsonb row to no end.
 */
export interface ItemCandidate {
  provider: 'usda' | 'off';
  /** The row's id in its own database: a USDA fdcId, or an Open Food Facts barcode. */
  id: string;
  description: string;
  /** The USDA data type, or the Open Food Facts brand line. Provenance detail only. */
  detail: string;
  per100g: Nutrition100g;
}

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
  /** The matched row's id in its own database: an fdcId, or an Open Food Facts barcode. */
  sourceId: string | null;
  matchedDescription: string | null;
  confidence: number;
  /**
   * The 100 g row the numbers above were scaled from — the matched row's, or the model's
   * own estimate when nothing matched. It is what lets a portion be re-priced by
   * arithmetic alone: the item carries neither the model's gram estimate nor the row it
   * won, so without this a correction would have to call a database again to change "2
   * slices" into "3".
   */
  per100g: Nutrition100g | null;
  /**
   * The rows that lost, best first, at most three and never two of the same description.
   * These are the choices a person is offered when the food is wrong.
   */
  candidates: ItemCandidate[];
  /**
   * The parse could not settle this item on its own: two rows it could not separate, a
   * portion it had to guess, or no database row at all. A flag for the UI, never an input
   * to the confidence score.
   */
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
