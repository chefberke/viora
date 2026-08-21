/**
 * How the three macros are named, ordered and coloured, and the glyphs that stand in for a
 * measure with no letter of its own.
 *
 * In `shared/` because two features draw the same figures: the log shows a day and an entry,
 * saved meals shows a bookmarked one. One list, so a colour or a name cannot drift between
 * two places that are meant to read as the same thing.
 */

import type { NutrientTotals } from './api-types';

export type MacroKey = 'carbs' | 'protein' | 'fat';

/** Grams per macro plus the calorie total. */
export interface MacroTotals {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** Anything that may or may not have been parsed into figures: a row, or a stored entry. */
export interface HasTotals {
  result: { totals: NutrientTotals } | null;
}

/**
 * What a set of parsed things adds up to.
 *
 * There were two copies of this loop — one over the composer's live row states, one over
 * the day's persisted entries — and `use-day-totals.ts` already claimed in its own comment
 * that the two are "the same numbers from the same parses". They were, by coincidence and
 * careful copying. One function is what makes that a fact.
 *
 * Grams are rounded at the end and calories are not. Rounding each row first would show a
 * day whose macros do not add up to its own rows, and calories arrive from the server
 * already whole.
 */
export function sumTotals(items: Iterable<HasTotals>): { totals: MacroTotals; waterMl: number } {
  let calories = 0;
  let carbs = 0;
  let protein = 0;
  let fat = 0;
  let waterMl = 0;

  for (const item of items) {
    const totals = item.result?.totals;

    if (!totals) {
      continue;
    }

    calories += totals.calories;
    carbs += totals.carbs;
    protein += totals.protein;
    fat += totals.fat;
    waterMl += totals.waterMl;
  }

  return {
    totals: {
      calories,
      carbs: Math.round(carbs),
      protein: Math.round(protein),
      fat: Math.round(fat),
    },
    waterMl,
  };
}

/** Order and presentation of the macros wherever they are listed. */
export const MACROS: ReadonlyArray<{
  key: MacroKey;
  /** Single letter shown before the value. */
  label: string;
  /** Written out, for the places that have the room. */
  name: string;
  /** Tailwind text color class for that letter. */
  colorClassName: string;
  /** The same colour as a fill, for the share bars. */
  fillClassName: string;
  /** What a gram of it is worth. The Atwater factors, which is how the panel splits a day. */
  kcalPerGram: number;
}> = [
  {
    key: 'carbs',
    label: 'C',
    name: 'Carbs',
    colorClassName: 'text-macro-carbs',
    fillClassName: 'bg-macro-carbs',
    kcalPerGram: 4,
  },
  {
    key: 'protein',
    label: 'P',
    name: 'Protein',
    colorClassName: 'text-macro-protein',
    fillClassName: 'bg-macro-protein',
    kcalPerGram: 4,
  },
  {
    key: 'fat',
    label: 'F',
    name: 'Fat',
    colorClassName: 'text-macro-fat',
    fillClassName: 'bg-macro-fat',
    kcalPerGram: 9,
  },
];

/** Calories have no letter; the flame stands in for one. */
export const CALORIE_GLYPH = '🔥';

/** Water is written the same way everywhere it is shown. */
export const WATER_GLYPH = '💧';
