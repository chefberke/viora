import type { ConfidenceLevel } from '@/shared/api-types';
import type { IoniconName } from '@/shared/ui';
import type { MacroTotals } from '@/shared/macros';
import type { ColorToken } from '@/theme';
import type { TimeOfDay } from './types';

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
 * How each part of the day greets, and the glyph that repeats it.
 *
 * The colours follow the light: orange at sunrise, amber through the afternoon, the blue
 * of a link after dark. They are three different tokens because they were never one set —
 * an earlier comment here claimed they were all "composer action tokens", which was true
 * of one of the three and stopped being true of any when the toolbar lost its buttons.
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

/**
 * How sure the parse was, in the three places that have to say so: the word, the colour of
 * the word, and the colour of the ring — which cannot take a class and so needs the token
 * by name.
 *
 * A `Record` rather than three lookups, for the reason the reference list next door gives:
 * the compiler then refuses to build once a fourth level exists and this list has not grown
 * with it. This used to be a label map, a class map, and a ternary chain inside a `color`
 * prop, which is three hand-kept copies of one fact.
 *
 * `high` carries no marker of its own. A confident row should look like an ordinary row —
 * marking every row marks none of them.
 */
export const CONFIDENCE: Record<
  ConfidenceLevel,
  { label: string; className: string; token: ColorToken; marker: IoniconName | null }
> = {
  high: { label: 'High', className: 'text-success', token: 'success', marker: null },
  medium: {
    label: 'Medium',
    className: 'text-warning',
    token: 'warning',
    marker: 'help-circle-outline',
  },
  low: { label: 'Low', className: 'text-danger', token: 'danger', marker: 'alert-circle-outline' },
};

/** What a screen reader hears after the calories. Spoken, so it is a phrase and not a word. */
export const CONFIDENCE_SPOKEN: Record<ConfidenceLevel, string> = {
  high: 'high confidence',
  medium: 'medium confidence',
  low: 'low confidence, worth a look',
};

/**
 * How long a portion typed by hand rests before it is sent. The same beat the saved-meal
 * sheet gives a renamed meal: long enough that "250" is not sent as 2, then 25, then 250.
 */
export const PORTION_COMMIT_MS = 1000;

/**
 * The portions offered beside the field, as multiples of what the item already says.
 *
 * They are relative on purpose. "Half of it" is the correction people actually make, and it
 * is the same gesture whether the row reads 200 g, one bowl, or two slices — an absolute
 * ladder would have to know what the food is to offer anything sensible.
 */
export const PORTION_MULTIPLIERS: readonly { label: string; factor: number }[] = [
  { label: '½×', factor: 0.5 },
  { label: '1×', factor: 1 },
  { label: '1½×', factor: 1.5 },
  { label: '2×', factor: 2 },
];
