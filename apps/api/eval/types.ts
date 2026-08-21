/**
 * The shapes the eval speaks in. Kept apart from the pipeline's own types: a gold case
 * describes what a human says the answer is, which is a different thing from what the
 * pipeline produces, and collapsing the two would let the expectation drift toward
 * whatever the code happens to do.
 */
import type { EntryKind, ItemSource, ParseResult } from '../src/types/index.ts';
import type { TraceDraft } from '../src/modules/entries/entries.types.ts';
import type { AccuracyFailure, EvalFailure } from './taxonomy.ts';

/**
 * An inclusive `[min, max]` range. Every numeric expectation is a band, never a point.
 *
 * A food diary is not a chemistry set: "one simit" is 200-320 kcal depending on the
 * bakery, and a harness that demanded 260 would report failures that are really just
 * the width of the real world. The bands here are what a dietitian would accept, and
 * a parse inside one is correct.
 */
export type Band = readonly [min: number, max: number];

/**
 * Which family of unit the line used. It is checked instead of the unit string itself,
 * because "bir bardak süt" is equally well read as `glass` or as `250 ml` — both are
 * volume, and both are right. Only crossing families is an error.
 */
export type UnitFamily = 'mass' | 'volume' | 'count';

export interface ExpectedItem {
  /**
   * Names that all count as this food. Matched by token overlap against the parsed
   * `name` and `matchedDescription` together, so "white rice" accepts "rice, white,
   * cooked". List the generic name plus whatever the local one is.
   */
  names: readonly string[];
  kind?: EntryKind;
  /** Total weight for a food item. Omitted when the line fixes no portion. */
  grams?: Band;
  /** Total volume for a water item. */
  ml?: Band;
  /** Calories for this item at the expected portion. */
  kcal?: Band;
  unitFamily?: UnitFamily;
}

export const GOLD_TAGS = [
  'simple',
  'typo',
  'multi_item',
  'brand',
  'volume_unit',
  'tr_unit',
  'vague_size',
  'water',
  'non_food',
  'injection',
  'composite',
  'cooked_raw',
  'mixed_language',
  'numeric_edge',
  'overflow',
] as const;

export type GoldTag = (typeof GOLD_TAGS)[number];

export interface GoldCase {
  /** Stable, filename-safe. It is the cassette's name, so it must never be reused. */
  id: string;
  /** The line exactly as a user would type it, typos and all. */
  input: string;
  lang: 'tr' | 'en' | 'mixed';
  tags: readonly GoldTag[];
  expect: {
    items: readonly ExpectedItem[];
    /** The row's kind. Defaults to 'food', or 'water' when every item is water. */
    kind?: EntryKind;
    /** The row total. Checked as well as the items, since errors can cancel out. */
    totalKcal?: Band;
    /**
     * True when the correct answer is no items at all: a line with no food in it, or one
     * that is trying to talk to the model rather than log a meal.
     */
    rejects?: boolean;
    /**
     * Strings that must not appear in `normalizedText` or `reasoning`. The canary for an
     * injection case: if the model repeats the payload, it read the line as an
     * instruction rather than as food.
     */
    forbids?: readonly string[];
  };
  /** Why this case is in the set. Shown in failure output. */
  notes?: string;
}

/** What one expected item and one parsed item did to each other. */
export interface ItemVerdict {
  expected: ExpectedItem | null;
  /** Index into `result.items`, or null when nothing was matched to the expectation. */
  predictedIndex: number | null;
  predictedName: string | null;
  source: ItemSource | null;
  confidence: number | null;
  /** Empty when this pairing is correct. */
  failures: AccuracyFailure[];
}

export interface CaseScore {
  case: GoldCase;
  /** Null when the pipeline threw before producing anything. */
  result: ParseResult | null;
  trace: TraceDraft | null;
  /** Set when the run failed outright rather than being merely wrong. */
  runFailure: EvalFailure | null;
  verdicts: ItemVerdict[];
  /** Row-level codes, i.e. ones no single item owns. */
  failures: AccuracyFailure[];
  /** True when nothing at all went wrong: no failures on the row or any item. */
  passed: boolean;
  matched: number;
  expectedCount: number;
  predictedCount: number;
}

export interface CalibrationBin {
  /** Lower edge, e.g. 0.8 for the 0.8-0.9 bin. */
  floor: number;
  count: number;
  meanConfidence: number;
  observedAccuracy: number;
}

export interface RunReport {
  /** ISO timestamp, passed in rather than read from the clock inside the run. */
  createdAt: string;
  model: string;
  promptVersion: string;
  promptFingerprint: string;
  mode: 'replay' | 'record';
  caseCount: number;
  /** Cases with no failure of any kind. The headline number. */
  passRate: number;
  items: {
    precision: number;
    recall: number;
    f1: number;
  };
  portion: {
    gramsMape: number;
    gramsInBandRate: number;
  };
  energy: {
    itemKcalMape: number;
    itemKcalInBandRate: number;
    rowKcalMape: number;
    rowKcalInBandRate: number;
  };
  kindAccuracy: number;
  unitFamilyAccuracy: number;
  /** Share of food items priced by a real database rather than a model guess. */
  groundingRate: number;
  sourceMix: Record<string, number>;
  /** Share of adversarial cases correctly returned empty. */
  adversarialRejectionRate: number;
  /**
   * How many items or cases each rate was actually computed over. Without these a metric
   * with an empty denominator renders as a confident 0%, which reads as a catastrophe
   * rather than as "not measured here".
   */
  coverage: {
    adversarialCases: number;
    portionChecked: number;
    itemKcalChecked: number;
    rowKcalChecked: number;
    unitFamilyChecked: number;
  };
  calibration: {
    bins: CalibrationBin[];
    /** Expected calibration error: how far the confidence scores are from honest. */
    ece: number;
  };
  failures: Array<{ code: EvalFailure; count: number; reason: string }>;
  latency: {
    p50TotalMs: number;
    p95TotalMs: number;
  };
  tokens: {
    prompt: number;
    completion: number;
  };
  byTag: Array<{ tag: GoldTag; cases: number; passRate: number }>;
  cases: CaseScore[];
}
