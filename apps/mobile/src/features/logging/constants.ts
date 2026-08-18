import type { MacroKey, MacroTotals } from './types';

/** Order and presentation of the macros in the summary bar. */
export const MACROS: ReadonlyArray<{
  key: MacroKey;
  /** Single letter shown before the value. */
  label: string;
  /** Tailwind text color class for that letter. */
  colorClassName: string;
}> = [
  { key: 'carbs', label: 'C', colorClassName: 'text-macro-carbs' },
  { key: 'protein', label: 'P', colorClassName: 'text-macro-protein' },
  { key: 'fat', label: 'F', colorClassName: 'text-macro-fat' },
];

/** Calories have no letter; the flame stands in for one. */
export const CALORIE_GLYPH = '🔥';

export const EMPTY_TOTALS: MacroTotals = {
  calories: 0,
  carbs: 0,
  protein: 0,
  fat: 0,
};
