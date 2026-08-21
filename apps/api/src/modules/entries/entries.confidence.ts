import type { ConfidenceLevel, ItemSource, ParsedItem } from '../../types/index.ts';
import { clamp, round2 } from '../../utils/index.ts';

/** What picking this row told us, beyond the row itself. Produced by `chooseMatch`. */
export interface MatchEvidence {
  /** How far ahead of the best rival row the winner finished, in rank units. */
  margin: number;
  /** How far the winner's energy sat from the model's estimate, in natural log units. */
  disagreement: number;
}

/**
 * The margin at which a win stops being a coin toss. A rank unit is roughly "one word of
 * the name", so a third of one is about the point where two rows stop being rivals.
 */
const MARGIN_SCALE = 0.3;

/** An ungrounded estimate can never present itself as more than a coin-flip-and-change. */
export const LLM_ESTIMATE_CONFIDENCE_CAP = 0.45;

/**
 * The model's self-report, scaled by how much the parse actually knows about the item.
 *
 * Two pieces of evidence scale it, and they are independent. `matchScore` is how much of
 * the name the row answered — did we find the food we were asked about. `disagreement` is
 * how far the row's own energy sat from the model's estimate before it was chosen, in
 * natural log units past the tolerance band — did the row we found look like that food.
 *
 * The second is new, and it is what the score was missing. Before it, a perfect
 * `matchScore` was almost automatic — most food names are fully covered by the row that
 * answers them — so the score was the model's self-report wearing a database's clothes,
 * and it reported the same near-certainty for "Bananas, raw" and for "Melon, banana".
 * Nothing in it knew that the second one had been picked over a fourfold disagreement
 * with what the model expected a banana to weigh in calories.
 *
 * Exhaustive on purpose, with no `default`: a source that fell through to a catch-all
 * would silently be trusted more than a USDA match, not less. The compiler is the guard.
 */
export function itemConfidence(
  llmSelf: number,
  source: ItemSource,
  matchScore: number,
  evidence: MatchEvidence,
): number {
  // Both are shares, and both are clamped rather than trusted: they multiply the score,
  // so a value outside 0-1 from either would not degrade the confidence, it would corrupt
  // it — and a negative one would produce a negative confidence.
  //
  // 1 when the row's energy is what the model expected, falling away as the two diverge.
  const agreement = clamp(Math.exp(-evidence.disagreement), 0, 1);
  // 1 when nothing else came close, falling away as a rival closes on the winner.
  const decisiveness = clamp(1 - Math.exp(-evidence.margin / MARGIN_SCALE), 0, 1);

  switch (source) {
    case 'usda':
      return round2(llmSelf * (0.70 + 0.1 * matchScore + 0.2 * agreement));

    // Crowd-entered from photographed labels rather than measured, so the same evidence
    // is worth a little less than USDA's.
    case 'off':
      return round2(llmSelf * (0.60 + 0.1 * matchScore + 0.2 * agreement));

    case 'llm_estimate':
      return round2(Math.min(llmSelf, LLM_ESTIMATE_CONFIDENCE_CAP));

    // Water is the one item whose numbers need no lookup and cannot be wrong: it has none.
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

/**
 * The three words the app puts on a row, set where the score was measured to mean
 * something rather than where round numbers fall.
 *
 * **low, under 0.55.** This is the grounding line and nothing else. An item no database
 * matched is capped at `LLM_ESTIMATE_CONFIDENCE_CAP` (0.45), so everything below 0.55 is
 * exactly the set of items whose numbers are a model's guess — which is the one thing a
 * food diary genuinely owes the user a warning about.
 *
 * **high, from 0.85.** Read off the reliability curve on the gold set, not chosen. The
 * three candidate cuts and what each one actually separates, over 193 items:
 *
 * ```
 *   >= 0.80   90.3% right (n=154)   <  0.80   76.9% right (n=39)    13.4pp apart
 *   >= 0.85   94.4% right (n=124)   <  0.85   75.4% right (n=69)    19.0pp apart
 *   >= 0.90   94.9% right (n=78)    <  0.90   82.6% right (n=115)   12.3pp apart
 * ```
 *
 * 0.85 is where the two groups are furthest apart. The old boundary of 0.8 was not read
 * off anything, and on the pre-Phase-2 code it split the set into halves that were right
 * 90.2% and 90.3% of the time — it distinguished nothing and told the user it did.
 *
 * The caveat belongs next to the numbers rather than in a footnote: this is 193 items
 * from 126 hand-written cases, and 24 of them are wrong. The cut is honest about what was
 * measured and the sample is small. Real correction data is what firms it up.
 */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.85) {
    return 'high';
  }

  if (confidence >= 0.55) {
    return 'medium';
  }

  return 'low';
}
