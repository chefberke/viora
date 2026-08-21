/**
 * Pairing what the parse produced with what the case expected.
 *
 * Everything downstream depends on this step. "Two items expected, two items produced"
 * says nothing on its own — they could be the same two foods, or a missed item plus an
 * invented one, which is a far worse failure at the same count. So the pairing is done
 * explicitly, and what is left over on each side is what names the failure.
 *
 * Names are compared with `contentTokens`, the pipeline's own tokenizer, so Turkish folds
 * the same way here as it does in the matcher being measured ("çorbası" and "corbasi" are
 * one word) and so does the plural of a food ("potatoes" answers an expectation of
 * "potato"). Sharing the tokenizer is what stops the harness from reporting a correct
 * parse as a miss over a letter the matcher itself does not see.
 *
 * Comparing against the matched database description as well as the parsed name is
 * deliberate: an item called "rice" that matched "Rice, white, cooked" satisfies an
 * expectation of "white rice", and pretending otherwise would report a success as a
 * failure.
 */
import { contentTokens } from '../src/modules/entries/entries.rank.ts';
import type { ParsedItem } from '../src/types/index.ts';
import type { ExpectedItem } from './types.ts';

/**
 * How much of an expected name must appear before two rows are the same food. Half is
 * low enough that "chicken" answers "chicken breast", and high enough that "rice" does
 * not answer "rice pudding" on the strength of one word — the aliases carry the rest.
 */
const MATCH_THRESHOLD = 0.5;

/** Everything a parsed item is known by: its own name and the row it matched. */
function predictedTokens(item: ParsedItem): Set<string> {
  return new Set(contentTokens(`${item.name} ${item.matchedDescription ?? ''}`));
}

/**
 * The best any of an expectation's aliases scores against one parsed item, as the share
 * of that alias's words the item carries. Taking the maximum is what lets a case list
 * both "yoğurt" and "yogurt" without either one dragging the score down.
 */
export function nameScore(expected: ExpectedItem, item: ParsedItem): number {
  const found = predictedTokens(item);
  let best = 0;

  for (const alias of expected.names) {
    const tokens = contentTokens(alias);

    if (tokens.length === 0) {
      continue;
    }

    const hits = tokens.filter((token) => found.has(token)).length;

    best = Math.max(best, hits / tokens.length);
  }

  return best;
}

export interface Pair {
  expectedIndex: number;
  predictedIndex: number;
  score: number;
}

export interface Alignment {
  pairs: Pair[];
  /** Expected items nothing was paired with. */
  unmatchedExpected: number[];
  /** Parsed items nothing was paired with. */
  unmatchedPredicted: number[];
  /**
   * Expected items that went unpaired but whose words are already inside a parsed item
   * that answered a different expectation — two foods returned as one row.
   */
  mergedExpected: number[];
  /**
   * Parsed items that went unpaired but which overlap an expectation already answered —
   * one food returned as two rows.
   */
  splitPredicted: number[];
}

/**
 * Greedy best-first assignment. Not the optimal assignment — that would be Hungarian —
 * but on rows of two to five items the two agree, and a greedy pass is something a reader
 * of the report can follow when they want to argue with a score.
 */
export function alignItems(
  expected: readonly ExpectedItem[],
  predicted: readonly ParsedItem[],
): Alignment {
  const candidates: Pair[] = [];

  for (const [expectedIndex, want] of expected.entries()) {
    for (const [predictedIndex, item] of predicted.entries()) {
      const score = nameScore(want, item);

      if (score >= MATCH_THRESHOLD) {
        candidates.push({ expectedIndex, predictedIndex, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const takenExpected = new Set<number>();
  const takenPredicted = new Set<number>();
  const pairs: Pair[] = [];

  for (const pair of candidates) {
    if (takenExpected.has(pair.expectedIndex) || takenPredicted.has(pair.predictedIndex)) {
      continue;
    }

    takenExpected.add(pair.expectedIndex);
    takenPredicted.add(pair.predictedIndex);
    pairs.push(pair);
  }

  pairs.sort((a, b) => a.expectedIndex - b.expectedIndex);

  const unmatchedExpected: number[] = [];
  const mergedExpected: number[] = [];

  for (const [index, want] of expected.entries()) {
    if (takenExpected.has(index)) {
      continue;
    }

    // Its words are already on the row that answered someone else: a merge, not a miss.
    const swallowed = pairs.some((pair) => nameScore(want, predicted[pair.predictedIndex]!) > 0);

    if (swallowed) {
      mergedExpected.push(index);
    } else {
      unmatchedExpected.push(index);
    }
  }

  const unmatchedPredicted: number[] = [];
  const splitPredicted: number[] = [];

  for (const [index, item] of predicted.entries()) {
    if (takenPredicted.has(index)) {
      continue;
    }

    // It overlaps an expectation that already has an answer: one food split across two.
    const duplicate = pairs.some((pair) => nameScore(expected[pair.expectedIndex]!, item) > 0);

    if (duplicate) {
      splitPredicted.push(index);
    } else {
      unmatchedPredicted.push(index);
    }
  }

  return { pairs, unmatchedExpected, unmatchedPredicted, mergedExpected, splitPredicted };
}
