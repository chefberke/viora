/** Portions: the user's units turned into grams, and per-100g figures scaled to them. */
import { clamp, round1 } from '../../utils/index.ts';
import type { Nutrition100g } from './entries.types.ts';

/**
 * Mass units, in grams. The conversion is exact and says nothing about the food, so the
 * model's estimate is never consulted: two ounces of anything is 56.7 g.
 */
export const MASS_UNIT_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.35,
  lb: 453.6,
};

/**
 * Volume units, in millilitres. Volume fixes how much space an item takes, never what it
 * weighs — a cup of cornflakes and a cup of honey share a volume and differ elevenfold in
 * mass — so grams come from the model's estimate, not from this table.
 */
export const VOLUME_UNIT_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  glass: 250,
  bottle: 500,
  can: 330,
};

/**
 * Grams per millilitre at the edges of what food reaches: air-popped popcorn near 0.03,
 * honey and syrup near 1.5. The bounds only catch an estimate that cannot be true of any
 * food; every plausible one passes through untouched.
 */
const MIN_DENSITY = 0.03;
const MAX_DENSITY = 1.5;

/** Stand-in when the model gave no estimate and the unit implies no size of its own. */
const FALLBACK_GRAMS = 100;

const MIN_GRAMS = 1;
const MAX_GRAMS = 5000;

function bounded(value: number): number {
  return Math.round(clamp(value, MIN_GRAMS, MAX_GRAMS));
}

/**
 * The item's total weight in grams. Mass units convert outright; volume units defer to
 * the model's estimate, held to a plausible density; count-like units (slice, piece,
 * serving) fix no size at all, so the estimate is all there is.
 */
export function toGrams(quantity: number, unit: string, estimatedGrams: number | null): number {
  const gramsPerUnit = MASS_UNIT_GRAMS[unit];

  if (gramsPerUnit !== undefined) {
    return bounded(quantity * gramsPerUnit);
  }

  const mlPerUnit = VOLUME_UNIT_ML[unit];

  if (mlPerUnit !== undefined) {
    const ml = quantity * mlPerUnit;

    // Without an estimate, water's density is the only neutral guess left.
    if (estimatedGrams === null) {
      return bounded(ml);
    }

    return bounded(clamp(estimatedGrams, ml * MIN_DENSITY, ml * MAX_DENSITY));
  }

  return bounded(estimatedGrams ?? FALLBACK_GRAMS);
}

/**
 * Water is the one food whose density is exactly 1, so its volume needs no estimate and
 * both unit tables convert straight through.
 */
export function toMl(quantity: number, unit: string, estimatedGrams: number | null): number {
  const mlPerUnit = VOLUME_UNIT_ML[unit] ?? MASS_UNIT_GRAMS[unit];

  if (mlPerUnit === undefined) {
    return bounded(estimatedGrams ?? FALLBACK_GRAMS);
  }

  return bounded(quantity * mlPerUnit);
}

export function scaleNutrition(
  per100g: Nutrition100g,
  grams: number,
): { calories: number; protein: number; carbs: number; fat: number } {
  const factor = grams / 100;

  return {
    calories: Math.round(per100g.kcal * factor),
    protein: round1(per100g.protein * factor),
    carbs: round1(per100g.carbs * factor),
    fat: round1(per100g.fat * factor),
  };
}
