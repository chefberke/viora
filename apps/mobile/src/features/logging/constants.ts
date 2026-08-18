import type { IoniconName } from '@/shared/ui';
import type { MacroKey, MacroTotals, TimeOfDay } from './types';

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

/**
 * How each part of the day greets, and the glyph that repeats it. The colours are the
 * composer action tokens: warm for daylight, the blue of the mic for the evening.
 */
export const GREETINGS: Record<
  TimeOfDay,
  { salutation: string; icon: IoniconName; colorClassName: string }
> = {
  morning: { salutation: 'Good morning', icon: 'sunny', colorClassName: 'text-action-add' },
  afternoon: {
    salutation: 'Good afternoon',
    icon: 'partly-sunny',
    colorClassName: 'text-warning',
  },
  evening: { salutation: 'Good evening', icon: 'moon', colorClassName: 'text-accent' },
};
