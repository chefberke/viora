import { env } from '../../config/index.ts';
import { log, logError } from '../../utils/index.ts';
import { contentTokens, scoreRow, splitDescription } from './entries.rank.ts';
import type { FoodMatch, Nutrition100g, SearchFood } from './entries.types.ts';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const REQUEST_TIMEOUT_MS = 5_000;
const RETRY_BASE_MS = 200;

/**
 * One outage prints one line, not one per item on the row. Same latch as Open Food Facts
 * has, and it was missing here — which mattered more, not less: USDA is the provider with
 * a key that can be revoked, and a revoked key degrades every item to a 0.45-confidence
 * estimate while looking exactly like a healthy day with unusual food in it. The accuracy
 * numbers would rot and nothing would say so.
 */
let degraded = false;

function noteUnavailable(error: unknown, fields: Record<string, unknown>): void {
  if (!degraded) {
    degraded = true;
    logError('usda_unavailable', error, fields);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function noteRecovered(): void {
  if (degraded) {
    degraded = false;
    log('usda_recovered');
  }
}

/**
 * Provenance: lab-measured generic data beats crowd-entered label data, at equal fit.
 *
 * The spread is narrow on purpose. These ran 1 to 3 and multiplied the fit score, which
 * made provenance the loudest term in the rank and let any SR Legacy row that merely
 * contained the query word beat the Branded row that WAS the food — "apple" answered by
 * "Croissants, apple". Identity has to be decided by the words; a table is only a way of
 * breaking a tie between two rows that both name the right food.
 */
const DATA_TYPE_WEIGHT: Record<string, number> = { Foundation: 1.6, 'SR Legacy': 1.5, Branded: 1 };


/**
 * Below this token overlap a candidate is rejected outright: a flagged LLM estimate
 * is more honest than a confidently wrong database match.
 */
const MIN_OVERLAP = 0.5;

/**
 * Nothing on Earth is denser than pure fat, which is 900 kcal per 100 g. The Open Food
 * Facts provider has always held its rows to this; USDA's did not, and a branded cereal
 * row filed at 1580 kcal per 100 g was ranked and served like any other. Branded rows are
 * label transcriptions here too, so they carry the same transcription errors.
 */
const MAX_KCAL_100G = 900;

/**
 * How many ranked rows a search hands back.
 *
 * Enough that the pipeline's plausibility check has somewhere to go when the top rows are
 * indistinguishable: a search for "greek yogurt" returns ten rows with that exact
 * description and nothing else, and the believable ones sit at positions two through six.
 * Bounded because every row is stored in the cache under that query.
 */
const CANDIDATE_LIMIT = 10;

/** Nutrient numbers in FDC search results: energy kcal, protein, fat, carbs. */
const NUTRIENT_NUMBERS = { kcal: '208', protein: '203', fat: '204', carbs: '205' } as const;

function readNutrients(food: Record<string, unknown>, dataType: string): Nutrition100g | null {
  const list = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const byNumber = new Map<string, number>();

  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const nutrient = entry as Record<string, unknown>;
    const number = String(nutrient.nutrientNumber ?? '');
    const value = nutrient.value;

    if (number !== '' && typeof value === 'number' && Number.isFinite(value)) {
      byNumber.set(number, value);
    }
  }

  const kcal = byNumber.get(NUTRIENT_NUMBERS.kcal);

  // A candidate without a believable energy figure cannot price a portion; skip it.
  if (kcal === undefined || kcal < 0 || kcal > MAX_KCAL_100G) {
    return null;
  }

  // What a zero means depends on where the row came from, and USDA holds both kinds in
  // one table. On a lab-measured row it is a measurement: brewed tea really is 0 kcal per
  // 100 g, and rejecting that made a cup of tea resolve to an 11 kcal row sitting beside
  // the right one. On a `Branded` row it is a transcribed label, where an unfilled energy
  // field reads as zero — which is how a can of Pepsi and a jar of pickles both came back
  // at no calories at all. Same number, opposite meanings, so the data type decides.
  if (kcal === 0 && dataType === 'Branded') {
    return null;
  }

  return {
    kcal,
    protein: byNumber.get(NUTRIENT_NUMBERS.protein) ?? 0,
    fat: byNumber.get(NUTRIENT_NUMBERS.fat) ?? 0,
    carbs: byNumber.get(NUTRIENT_NUMBERS.carbs) ?? 0,
  };
}

/**
 * Ranks the rows a search returned, best first. Pure: it touches no network and no clock,
 * so an eval can record the rows once and then replay every later change to these rules
 * against them without spending another request. It is also what the correction loop
 * needs — the runner-up rows are the choices a user is offered when the top one is wrong.
 */
export function rankMatches(query: string, foods: unknown[], limit = 3): FoodMatch[] {
  const queryTokens = contentTokens(query);

  if (queryTokens.length === 0) {
    return [];
  }

  const ranked: FoodMatch[] = [];

  for (const candidate of foods) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue;
    }

    const food = candidate as Record<string, unknown>;
    const fdcId = food.fdcId;
    const description = typeof food.description === 'string' ? food.description : '';
    const dataType = typeof food.dataType === 'string' ? food.dataType : '';

    if (typeof fdcId !== 'number' || description === '') {
      continue;
    }

    const { primary, qualifiers } = splitDescription(description);
    const score = scoreRow(queryTokens, primary, qualifiers);

    if (score.coverage < MIN_OVERLAP) {
      continue;
    }

    const per100g = readNutrients(food, dataType);

    if (per100g === null) {
      continue;
    }

    ranked.push({
      provider: 'usda',
      id: String(fdcId),
      description,
      detail: dataType,
      per100g,
      matchScore: score.coverage,
      rank: (DATA_TYPE_WEIGHT[dataType] ?? 0.9) * score.coverage + score.penalty + score.stateBonus,
    });
  }

  // Stable on ties: USDA returns its own relevance order, and among rows this scores
  // identically that order is the only extra information available.
  ranked.sort((a, b) => b.rank - a.rank);

  return ranked.slice(0, limit);
}

/** The single best row on the words alone. Used by the hand-run checks. */
export function pickBestMatch(query: string, foods: unknown[]): FoodMatch | null {
  return rankMatches(query, foods, 1)[0] ?? null;
}

/**
 * The canonical rows that could be this food, best first. `[]` is USDA answering that it
 * holds none; null is USDA being unreachable, which the pipeline treats the same way at
 * the point of use and the cache must not.
 */
export const searchUsdaFood: SearchFood = async (query) => {
  const hits = await fetchUsdaHits(query);

  return hits === null ? null : rankMatches(query, hits, CANDIDATE_LIMIT);
};

/**
 * The search request on its own: the rows USDA returned, unranked.
 *
 * Null and `[]` mean different things here, and the difference is why this is separate
 * from the ranking above. `[]` is an answer — USDA looked and holds nothing. Null is an
 * outage, which is not an answer at all. The pipeline collapses both to "fall back to a
 * flagged estimate", but a cache or a recorder must never store an outage as though the
 * food does not exist.
 */
export async function fetchUsdaHits(query: string): Promise<unknown[] | null> {
  const url =
    `${SEARCH_URL}?api_key=${encodeURIComponent(env.USDA_API_KEY)}` +
    `&query=${encodeURIComponent(query)}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy,Branded')}` +
    `&pageSize=10`;

  let lastStatus = 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      if (!response.ok) {
        lastStatus = response.status;
        lastError = new Error(`usda answered ${response.status}`);

        // A revoked or over-quota key answers instantly, so the old bare `continue` spent
        // both attempts in the same millisecond and learned the same thing twice.
        await delay(Math.random() * RETRY_BASE_MS * 2 ** attempt);
        continue;
      }

      const body = (await response.json()) as { foods?: unknown };

      noteRecovered();

      return Array.isArray(body.foods) ? body.foods : [];
    } catch (error) {
      lastError = error;
      await delay(Math.random() * RETRY_BASE_MS * 2 ** attempt);
    }
  }

  // Logged once both attempts are spent, so a single blip that the retry covered stays
  // quiet and a real outage says so exactly once. The status is part of the line because
  // it is the only thing that tells a revoked key apart from a slow day.
  noteUnavailable(lastError, { query, status: lastStatus });

  return null;
}
