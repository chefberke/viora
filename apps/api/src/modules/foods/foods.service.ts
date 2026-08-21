/**
 * The food search behind a correction: what a person picks from when none of an item's
 * candidates were the food.
 *
 * It reuses the pipeline's own lookup, cache and ranking rather than talking to the
 * providers itself. Two search paths would mean two opinions about which row answers
 * "yogurt" best — and the one a person picks here has to be a row the parser could have
 * picked itself, or the corrections would teach the parser nothing about its own ranking.
 */
import { env } from '../../config/index.ts';
import type { ItemCandidate } from '../../types/index.ts';
import { badGateway } from '../../utils/index.ts';
import { toCandidate } from '../entries/entries.assemble.ts';
import { resolveFrom } from '../entries/entries.lookup.ts';
import { searchOffFood, takeOffSlot } from '../entries/entries.off.ts';
import type { FoodMatch } from '../entries/entries.types.ts';
import { searchUsdaFood } from '../entries/entries.usda.ts';

/** As many rows as a picker can show without becoming a database browser. */
const SEARCH_LIMIT = 8;

/**
 * Rows for one query, best first.
 *
 * `rank` orders rows within a single query, which is exactly the question here — the two
 * providers' figures are not comparable across queries, and nothing in this file compares
 * them across one. USDA's provenance weight is already inside its rank, so lab-measured
 * rows sit above crowd-entered ones at equal fit without any thumb on the scale.
 */
export async function searchFoods(query: string, language: string): Promise<ItemCandidate[]> {
  const usda = await resolveFrom('usda', query, language, searchUsdaFood, true);

  // Open Food Facts only when its own budget grants a slot. A person searching must never
  // be able to spend the minute of lookups the parse pipeline is relying on: the search
  // degrades to lab data, which is a worse answer, where the parse would degrade to a model
  // guess, which is not an answer at all.
  const off =
    env.OFF_ENABLED && (await takeOffSlot())
      ? await resolveFrom('off', query, language, searchOffFood, true)
      : null;

  const rows: FoodMatch[] = [...usda.candidates, ...(off?.candidates ?? [])];

  // Both doors shut. An empty list would read as "no such food", which is a claim neither
  // database made — one of them was never asked and the other never answered.
  if (rows.length === 0 && usda.unreachable && (off === null || off.unreachable)) {
    throw badGateway('food_search_unavailable');
  }

  return rows
    .sort((a, b) => b.rank - a.rank)
    .slice(0, SEARCH_LIMIT)
    .map(toCandidate);
}
