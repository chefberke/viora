/**
 * The accuracy error taxonomy.
 *
 * `entries.errors.ts` already has a taxonomy, but it is a *transport* one: it says the
 * model could not be reached or did not answer in JSON. It has nothing to say about a
 * parse that succeeded and was wrong, which is the only kind of failure a food diary
 * actually suffers from. These are those codes.
 *
 * Every code answers one question: given a line, its expected reading, and what the
 * pipeline produced, what specifically went wrong? A run that produces no codes is a run
 * that was right. Both halves of the table are exported together so a report can print
 * one histogram rather than two.
 */
import { PIPELINE_ERROR_CODES, type PipelineErrorCode } from '../src/modules/entries/entries.errors.ts';

/** Failures of a parse that completed. Ordered roughly worst-first for reports. */
export const ACCURACY_FAILURES = [
  /** The line named a food and the parse does not contain it at all. */
  'missed_item',
  /** The parse contains a food the line never named. The hallucination case. */
  'hallucinated_item',
  /** Two foods in the line came back as one item ("çay ve simit" as one row). */
  'merged_items',
  /** One food in the line came back as two items. */
  'split_item',
  /** The item is there and the portion is right, but the matched food is not that food. */
  'wrong_food',
  /** The right food at the wrong weight — outside the expected gram band. */
  'wrong_portion',
  /** The unit the model chose is not the family the line used (mass/volume/count). */
  'wrong_unit',
  /** Food logged as water, or water logged as food. */
  'wrong_kind',
  /**
   * No food database matched, so the numbers are the model's own guess. Not wrong on its
   * own — it is the designed fallback — but it is the metric that says how much of the
   * diary rests on a guess, and it is capped at 0.45 confidence for that reason.
   */
  'ungrounded_fallback',
  /** A line with no food in it produced items anyway. */
  'non_food_not_rejected',
  /** The line carried an instruction and the model obeyed it instead of reading food. */
  'injection_followed',
  /** The item list hit MAX_ITEMS and was cut off without saying so. */
  'truncated_items',
] as const;

export type AccuracyFailure = (typeof ACCURACY_FAILURES)[number];

/** Why each code exists, printed beside the histogram so a report explains itself. */
export const FAILURE_REASON: Record<AccuracyFailure, string> = {
  missed_item: 'a food in the line is absent from the parse',
  hallucinated_item: 'the parse invented a food the line never named',
  merged_items: 'two foods came back as one item',
  split_item: 'one food came back as two items',
  wrong_food: 'right portion, but the matched food is the wrong food',
  wrong_portion: 'right food, weight outside the expected band',
  wrong_unit: 'the unit family does not match the one the line used',
  wrong_kind: 'food logged as water, or water logged as food',
  ungrounded_fallback: 'no database matched, so the numbers are a model guess',
  non_food_not_rejected: 'a line with no food produced items',
  injection_followed: 'the model obeyed an instruction hidden in the line',
  truncated_items: 'the item list was cut at MAX_ITEMS without saying so',
};

/** A run that never got a result at all: the transport taxonomy, plus the unforeseen. */
export const RUN_FAILURES = [...PIPELINE_ERROR_CODES, 'unexpected_error'] as const;

export type RunFailure = PipelineErrorCode | 'unexpected_error';

/** One table. A report prints a single histogram over this union. */
export type EvalFailure = AccuracyFailure | RunFailure;

export function isAccuracyFailure(value: EvalFailure): value is AccuracyFailure {
  return (ACCURACY_FAILURES as readonly string[]).includes(value);
}
