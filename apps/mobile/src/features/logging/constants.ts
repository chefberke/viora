import type { IoniconName } from '@/shared/ui';
import type { MacroKey, MacroTotals, TimeOfDay } from './types';

/** Order and presentation of the macros in the summary bar and the day panel. */
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

/**
 * How far a panel reaches past the pill it opens out of, on each side. The month card and
 * the day card are both a handle with a card under it, and a card exactly as wide as its
 * handle reads as the handle stretched rather than as something that came out of it. A few
 * points of overhang is enough to say they are two things.
 */
export const PANEL_OVERHANG = 8;

/** Calories have no letter; the flame stands in for one. */
export const CALORIE_GLYPH = '🔥';

/** Water is written the same way everywhere it is shown. */
export const WATER_GLYPH = '💧';

/**
 * The beat a row opens on, before it has a word for what it is doing. It is shown once, at
 * the start of a parse, and never comes back: an ellipsis that returned every few seconds
 * would read as the work restarting.
 */
export const PARSE_LEAD = '…';

/** How long that opening beat holds. Short — it is the pause before the first word. */
export const PARSE_LEAD_MS = 900;

/**
 * What a row says at its right edge while its parse runs, one list per phase, walked round
 * and round after the opening beat. A parse can take a while, and a single word held for
 * all of it reads as a stall — the same word, sitting there, saying nothing new. Words that
 * keep coming read as work being done.
 */
export const PARSE_WORDS: Record<'reading' | 'calculating', readonly string[]> = {
  reading: ['Reading', 'Weighing', 'Adding up'],
  calculating: ['Calculating', 'Weighing', 'Adding up'],
};

/**
 * How long one parse word holds before the next takes its place. Long enough to be read
 * and then sit there a while: a word that leaves soon after it is read draws the eye back
 * to itself every few seconds, which is its own kind of noise. The change is there to say
 * the work is still moving, not to be watched.
 */
export const PARSE_WORD_MS = 4200;

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

/**
 * The type of one composer row: the written line and the label beside it.
 *
 * It is `text-lg` size with `text-lg`'s line height dropped, which is why it is written
 * out rather than named. A line height above the font's own leaves extra leading, and the
 * two sides spend it differently — a `Text` splits it above and below the glyphs, a
 * multiline `TextInput` puts all of it above the first line. The label would then ride a
 * few points higher than the words it belongs to. With the font's own leading on both
 * sides they start on the same line.
 */
export const ROW_TEXT_CLASS = 'text-[1.125rem]';

/**
 * One line of a composer row, in points: the row font's own leading, rounded. The rows
 * carry no line height of their own (see `ROW_TEXT_CLASS`), so anything that has to sit on
 * the same line as the writing — the loading placeholder, the empty row's prompt — takes
 * this number rather than guessing at one.
 */
export const ROW_LINE_HEIGHT = 19;
