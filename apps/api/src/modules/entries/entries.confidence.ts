import type { ConfidenceLevel, ItemSource, ParsedItem } from '../../types/index.ts';
import { round2 } from '../../utils/index.ts';

/** An ungrounded estimate can never present itself as more than a coin-flip-and-change. */
export const LLM_ESTIMATE_CONFIDENCE_CAP = 0.45;

/**
 * The model's self-report scaled by how well the database match fit. A perfect USDA
 * match keeps the self-report; a barely-accepted one takes a 30% haircut.
 *
 * Exhaustive on purpose, with no `default`: a source that fell through to a catch-all
 * would silently be trusted more than a USDA match, not less. The compiler is the guard.
 */
export function itemConfidence(llmSelf: number, source: ItemSource, matchScore: number): number {
  switch (source) {
    case 'usda':
      return round2(llmSelf * (0.7 + 0.3 * matchScore));

    // Crowd-entered from photographed labels rather than measured, so the same match
    // quality is worth a little less than USDA's.
    case 'off':
      return round2(llmSelf * (0.6 + 0.3 * matchScore));

    case 'llm_estimate':
      return round2(Math.min(llmSelf, LLM_ESTIMATE_CONFIDENCE_CAP));

    case 'water':
      return round2(llmSelf);
  }
}

/**
 * Calorie-share-weighted mean, so a shaky 20-calorie garnish cannot drag down a
 * well-grounded meal. Zero-calorie rows (water) fall back to a plain mean.
 */
export function overallConfidence(items: ParsedItem[]): number {
  if (items.length === 0) {
    return 0;
  }

  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);

  if (totalCalories === 0) {
    return round2(items.reduce((sum, item) => sum + item.confidence, 0) / items.length);
  }

  return round2(
    items.reduce((sum, item) => sum + item.confidence * item.calories, 0) / totalCalories,
  );
}

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.8) {
    return 'high';
  }

  if (confidence >= 0.55) {
    return 'medium';
  }

  return 'low';
}
