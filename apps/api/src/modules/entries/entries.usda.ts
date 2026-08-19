import { env } from '../../config/index.ts';
import type { Nutrition100g, UsdaMatch } from './entries.types.ts';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const REQUEST_TIMEOUT_MS = 5_000;

/** Generic lab-measured data beats crowd-entered label data. */
const DATA_TYPE_WEIGHT: Record<string, number> = { Foundation: 3, 'SR Legacy': 2, Branded: 1 };

/**
 * Below this token overlap a candidate is rejected outright: a flagged LLM estimate
 * is more honest than a confidently wrong database match.
 */
const MIN_OVERLAP = 0.5;

/** Nutrient numbers in FDC search results: energy kcal, protein, fat, carbs. */
const NUTRIENT_NUMBERS = { kcal: '208', protein: '203', fat: '204', carbs: '205' } as const;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function readNutrients(food: Record<string, unknown>): Nutrition100g | null {
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

  // A candidate without an energy figure cannot price a portion; skip it.
  if (kcal === undefined) {
    return null;
  }

  return {
    kcal,
    protein: byNumber.get(NUTRIENT_NUMBERS.protein) ?? 0,
    fat: byNumber.get(NUTRIENT_NUMBERS.fat) ?? 0,
    carbs: byNumber.get(NUTRIENT_NUMBERS.carbs) ?? 0,
  };
}

function pickBestMatch(query: string, foods: unknown[]): UsdaMatch | null {
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return null;
  }

  let best: UsdaMatch | null = null;
  let bestScore = -Infinity;

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

    const descriptionTokens = tokenize(description);
    const matched = queryTokens.filter((token) => descriptionTokens.includes(token)).length;
    const overlap = matched / queryTokens.length;

    if (overlap < MIN_OVERLAP) {
      continue;
    }

    const per100g = readNutrients(food);

    if (per100g === null) {
      continue;
    }

    // Long descriptions are specific preparations; prefer the short generic entry.
    const extraTokens = Math.max(0, descriptionTokens.length - matched);
    const score = (DATA_TYPE_WEIGHT[dataType] ?? 0.5) * overlap - 0.1 * extraTokens;

    if (score > bestScore) {
      bestScore = score;
      best = { fdcId, description, dataType, per100g, matchScore: overlap };
    }
  }

  return best;
}

/**
 * Finds the best canonical match for a food name. Returns null on no good match AND
 * on any USDA outage — the pipeline treats both as "fall back to the flagged estimate",
 * so a third-party outage never fails a user's request.
 */
export async function searchFood(name: string): Promise<UsdaMatch | null> {
  const url =
    `${SEARCH_URL}?api_key=${encodeURIComponent(env.USDA_API_KEY)}` +
    `&query=${encodeURIComponent(name)}` +
    `&dataType=${encodeURIComponent('Foundation,SR Legacy,Branded')}` +
    `&pageSize=10`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

      if (!response.ok) {
        continue;
      }

      const body = (await response.json()) as { foods?: unknown };
      return pickBestMatch(name, Array.isArray(body.foods) ? body.foods : []);
    } catch {
      // Timeout or network failure: one more try, then give up quietly.
    }
  }

  return null;
}
