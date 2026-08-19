/**
 * Every number the suggestion ranking turns on, in one file. Tuning happens here and nowhere
 * else, so a change to how suggestions feel is always one diff in one place.
 *
 * The comments say *why* each number is what it is. Several of them exist because the obvious
 * value is wrong in a way that only shows up on a real history — those are called out.
 */

/** How far back the history is read. Long enough for a seasonal habit, short enough to stay cheap. */
export const HISTORY_DAYS = 90;

/**
 * How many suggestions the endpoint returns. The composer shows three; the few extra are there
 * so the client can drop one without a second round trip. There is no text search on the
 * client, so a larger pool would buy nothing.
 */
export const MAX_CANDIDATES = 10;

/**
 * Recency half-life, in days. At 21 a weekly ritual still scores 0.72 a week later, so Sunday
 * pancakes survive to the next Sunday, while something eaten once two months ago does not.
 */
export const RECENCY_TAU_DAYS = 21;

/** Where "I eat this constantly" tops out. Beyond a month of days, more days say nothing new. */
export const HABIT_SATURATION_DAYS = 30;

export const HABIT_WEIGHT = 0.45;
export const RECENCY_WEIGHT = 0.55;

/** Half-hour buckets. Finer than the spread of a real mealtime, coarser than noise. */
export const TIME_BUCKETS = 48;
export const MINUTES_PER_BUCKET = 1440 / TIME_BUCKETS;

/**
 * The width of "around this time", in minutes. 110, not the tempting 75: people eat breakfast
 * anywhere between 07:00 and 10:30, and a tight kernel calls 10:00 a different meal from 08:00.
 */
export const TIME_SIGMA_MIN = 110;

/**
 * What the time signal says when it knows nothing. It has to be a real number rather than a
 * special case, because a candidate with no recorded times must rank *as if time were not a
 * factor* — neither rewarded nor punished for the absence.
 */
export const TIME_NEUTRAL = 0.6;

/**
 * How fast the time signal is trusted, in observations. With K = 3, three sightings move a
 * candidate halfway from neutral to its measured fit. Without this blend a single lucky
 * observation at the right minute would outrank a well-established habit that happens to
 * carry no times yet — a ranking decided by data availability, not by the user's habits.
 */
export const TIME_BLEND_K = 3;

/**
 * The floor under the time signal. Time multiplies the score, so unfloored it can zero
 * anything: a breakfast logged at 08:00 every day for three months scores ~0.004 at noon and
 * drops off the list, while a one-off snack from Tuesday tops it. Worse, someone who logs the
 * whole day at 22:30 would get an empty list every morning. The floor caps how much time can
 * say to 4x, which is about what frequency itself is worth.
 */
export const TIME_FIT_FLOOR = 0.25;

/** Day-of-week needs a week of days before it is allowed an opinion at all. */
export const DOW_MIN_DAYS = 7;
/** And even then it may only nudge by 15% either way. It is the weakest of the four signals. */
export const DOW_RANGE = 0.15;
/** Pseudo-count that pulls a thin weekday record back toward "no weekday pattern". */
export const DOW_PRIOR = 2;

/** The most that "you usually have this alongside what you already logged" can add. */
export const TOGETHER_MAX_LIFT = 0.35;
/** Below five days, a pairing is coincidence. */
export const TOGETHER_MIN_DAYS = 5;
/** Shrinkage, so a 3-of-3 pairing does not claim certainty off three days. */
export const TOGETHER_PRIOR = 2;

/** You do not eat the same thing twice in a day — unless your own history says you do. */
export const SAME_DAY_MIN_DAYS = 3;
/** On at least this share of its days it was logged more than once. */
export const SAME_DAY_MIN_REPEAT_RATE = 0.3;
/** And the second helping has to be a separate occasion, not the same sitting. */
export const SAME_DAY_MIN_GAP_MIN = 120;
/** A repeat is still less likely than something new, even when it is allowed. */
export const SAME_DAY_PENALTY = 0.55;

/** A bookmark is a stated intention, so it counts as a habit even before it is one. */
export const BOOKMARK_HABIT_FLOOR = 0.5;
export const BOOKMARK_MULT = 1.3;

/** Seen on fewer days than this is not a habit yet. */
export const NOISE_MIN_DAYS = 2;
/** ...unless it is recent enough to still be what you are eating this week. */
export const NOISE_MAX_AGE_DAYS = 5;
/**
 * A long line is a one-off description, not a meal you will write again. Counted in words
 * rather than characters, because the parser's normalized wording runs long by nature.
 */
export const NOISE_MAX_WORDS = 12;
export const NOISE_MIN_SCORE = 0.05;
/**
 * A new user has no habits yet, so the "seen on two days" rule would leave them with nothing
 * to see. Below two weeks of use it is waived and anything logged at all can be offered.
 */
export const NOISE_WAIVE_ACTIVE_DAYS = 14;
