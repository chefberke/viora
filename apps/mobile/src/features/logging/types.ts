export type MacroKey = 'carbs' | 'protein' | 'fat';

/** Grams per macro plus the calorie total for a day. */
export interface MacroTotals {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** Which part of the day the greeting speaks to. */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
