export type MacroKey = 'carbs' | 'protein' | 'fat';

/** Grams per macro plus the calorie total for a day. */
export interface MacroTotals {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

/** What the composer is doing with the text. `'reading'` means it is being parsed. */
export type ComposerStatus = 'idle' | 'reading';

/** Which layout the screen renders. Static for now — see today-screen.tsx. */
export type ComposerState = 'idle' | 'composing';
