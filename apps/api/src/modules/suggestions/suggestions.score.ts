/**
 * The ranking. Pure: it takes a folded history and the client's own day and minute, and it
 * never reads a clock or a database. That is deliberate — the server is UTC and the user may
 * not be, so any `new Date()` in here would quietly score the wrong hour for half the world.
 */
import {
  BOOKMARK_HABIT_FLOOR,
  BOOKMARK_MULT,
  DOW_MIN_DAYS,
  DOW_PRIOR,
  DOW_RANGE,
  HABIT_SATURATION_DAYS,
  HABIT_WEIGHT,
  MINUTES_PER_BUCKET,
  NOISE_MAX_AGE_DAYS,
  NOISE_MAX_WORDS,
  NOISE_MIN_DAYS,
  NOISE_MIN_SCORE,
  NOISE_WAIVE_ACTIVE_DAYS,
  RECENCY_TAU_DAYS,
  RECENCY_WEIGHT,
  SAME_DAY_MIN_DAYS,
  SAME_DAY_MIN_GAP_MIN,
  SAME_DAY_MIN_REPEAT_RATE,
  SAME_DAY_PENALTY,
  TIME_BLEND_K,
  TIME_BUCKETS,
  TIME_FIT_FLOOR,
  TIME_NEUTRAL,
  TIME_SIGMA_MIN,
  TOGETHER_MAX_LIFT,
  TOGETHER_MIN_DAYS,
  TOGETHER_PRIOR,
} from './suggestions.constants.ts';
import { daysBetween } from './suggestions.day.ts';
import type { CandidateStats, ScoreContext } from './suggestions.types.ts';

const MINUTES_PER_DAY = 1440;

/** Minutes apart on a clock face, so 23:50 and 00:10 are twenty minutes apart, not 1420. */
export function circularDelta(a: number, b: number): number {
  const raw = Math.abs(a - b);

  return Math.min(raw, MINUTES_PER_DAY - raw);
}

export function bucketOf(minute: number): number {
  return Math.min(TIME_BUCKETS - 1, Math.floor(minute / MINUTES_PER_BUCKET));
}

/**
 * How much each bucket lends to each other bucket, precomputed once. The histogram is small
 * and fixed, so the whole kernel is 48x48 numbers and every density is a dot product.
 */
const KERNEL: readonly (readonly number[])[] = Array.from({ length: TIME_BUCKETS }, (_, i) => {
  const centreI = i * MINUTES_PER_BUCKET + MINUTES_PER_BUCKET / 2;

  return Array.from({ length: TIME_BUCKETS }, (_, j) => {
    const centreJ = j * MINUTES_PER_BUCKET + MINUTES_PER_BUCKET / 2;
    const delta = circularDelta(centreI, centreJ);

    return Math.exp(-(delta * delta) / (2 * TIME_SIGMA_MIN * TIME_SIGMA_MIN));
  });
});

/**
 * How well now matches the hours this food is usually eaten at, in 0..1.
 *
 * The density is peak-normalised rather than compared against some absolute, and that choice
 * is what makes it behave. A max over the raw sightings would saturate for anything frequent
 * enough — log coffee three times a day for three months and *something* is always within
 * half an hour of any moment, so the time signal vanishes exactly where it matters most. It
 * would also punish genuinely all-day foods for being spread thin. Normalising by the
 * candidate's own peak asks the right question instead: is this one of *its* hours? A food
 * eaten at all hours answers yes at every hour, which is correct — it is always plausible.
 */
function rawTimeFit(histogram: readonly number[], minute: number): number {
  let peak = 0;
  let here = 0;
  const target = bucketOf(minute);

  for (let i = 0; i < TIME_BUCKETS; i += 1) {
    const row = KERNEL[i]!;
    let density = 0;

    for (let j = 0; j < TIME_BUCKETS; j += 1) {
      const weight = histogram[j] ?? 0;

      if (weight !== 0) {
        density += weight * row[j]!;
      }
    }

    if (i === target) {
      here = density;
    }

    if (density > peak) {
      peak = density;
    }
  }

  return peak > 0 ? here / peak : TIME_NEUTRAL;
}

/**
 * The time signal, blended toward neutral by how much of it we actually have and floored so
 * it can never wipe a candidate out. See `TIME_FIT_FLOOR` and `TIME_BLEND_K` for why both
 * guards exist — each one fixes a way the plain multiplier ruins the list.
 */
export function timeFit(candidate: CandidateStats, minute: number): number {
  const samples = candidate.timedCount;
  const measured = samples === 0 ? TIME_NEUTRAL : rawTimeFit(candidate.histogram, minute);
  const trust = samples / (samples + TIME_BLEND_K);
  const blended = TIME_NEUTRAL + (measured - TIME_NEUTRAL) * trust;

  return TIME_FIT_FLOOR + (1 - TIME_FIT_FLOOR) * blended;
}

/** How much of a fixture this is, measured against how long the user has been logging at all. */
function habitStrength(candidate: CandidateStats, activeDays: number): number {
  const ceiling = Math.max(1, Math.min(HABIT_SATURATION_DAYS, activeDays));
  const raw = Math.min(1, Math.log1p(candidate.distinctDays) / Math.log1p(ceiling));

  return candidate.isBookmarked ? Math.max(raw, BOOKMARK_HABIT_FLOOR) : raw;
}

function recencyStrength(candidate: CandidateStats, day: number): number {
  if (candidate.lastDay === null) {
    return 0;
  }

  return Math.exp(-Math.max(0, daysBetween(candidate.lastDay, day)) / RECENCY_TAU_DAYS);
}

/**
 * A nudge for foods that belong to this weekday. Gated behind a week of days and clamped to a
 * narrow band, because weekday is the thinnest evidence of the four and a single coincidence
 * should not be allowed to reorder anything.
 */
function weekdayFit(candidate: CandidateStats): number {
  if (candidate.distinctDays < DOW_MIN_DAYS) {
    return 1;
  }

  const expected = candidate.distinctDays / 7;
  const lift = (candidate.sameDowDays + DOW_PRIOR) / (expected + DOW_PRIOR);

  return Math.min(1 + DOW_RANGE, Math.max(1 - DOW_RANGE, lift));
}

/**
 * "You already had coffee, and coffee days are toast days." Shrunk with a pseudo-count: the
 * raw ratio would hand a full boost to three days of coincidence, and taking the best of
 * several partners is biased upward before it even starts.
 */
function togetherLift(candidate: CandidateStats, context: ScoreContext): number {
  let best = 0;

  for (const partner of context.partners) {
    if (partner.daysWith < TOGETHER_MIN_DAYS) {
      continue;
    }

    const shared = partner.coDays.get(candidate.key) ?? 0;
    const ratio = shared / (partner.daysWith + TOGETHER_PRIOR);

    if (ratio > best) {
      best = ratio;
    }
  }

  return 1 + TOGETHER_MAX_LIFT * best;
}

/**
 * The same-day rule. You do not eat the same meal twice in one day, so anything already on
 * today's plate is dropped — unless this user's own history says otherwise, which is what
 * saves the second coffee and the fourth glass of water.
 */
function sameDayFactor(candidate: CandidateStats, minute: number): number | null {
  if (candidate.timesToday === 0) {
    return 1;
  }

  const repeatRate =
    candidate.distinctDays === 0 ? 0 : candidate.repeatDays / candidate.distinctDays;

  if (
    candidate.distinctDays < SAME_DAY_MIN_DAYS ||
    repeatRate < SAME_DAY_MIN_REPEAT_RATE ||
    candidate.timesToday >= candidate.maxPerDay
  ) {
    return null;
  }

  // An unknown time passes: it cannot be shown to be recent, and failing it would leave the
  // whole exception path dead for every row logged before times were recorded.
  const gapIsWide =
    candidate.lastMinuteToday === null ||
    circularDelta(minute, candidate.lastMinuteToday) >= SAME_DAY_MIN_GAP_MIN;

  return gapIsWide ? SAME_DAY_PENALTY : null;
}

/** Guesses are worse than silence, so anything thin enough to be a guess is thrown away. */
function isTooThin(candidate: CandidateStats, context: ScoreContext): boolean {
  if (candidate.text.trim().split(/\s+/).length > NOISE_MAX_WORDS) {
    return true;
  }

  if (candidate.isBookmarked || context.activeDays < NOISE_WAIVE_ACTIVE_DAYS) {
    return false;
  }

  if (candidate.distinctDays >= NOISE_MIN_DAYS) {
    return false;
  }

  const age = candidate.lastDay === null ? Infinity : daysBetween(candidate.lastDay, context.day);

  return age > NOISE_MAX_AGE_DAYS;
}

/** The score for one candidate right now, or null when it should not be offered at all. */
export function scoreCandidate(candidate: CandidateStats, context: ScoreContext): number | null {
  if (isTooThin(candidate, context)) {
    return null;
  }

  const sameDay = sameDayFactor(candidate, context.minute);

  if (sameDay === null) {
    return null;
  }

  const base =
    HABIT_WEIGHT * habitStrength(candidate, context.activeDays) +
    RECENCY_WEIGHT * recencyStrength(candidate, context.day);

  const score =
    base *
    timeFit(candidate, context.minute) *
    weekdayFit(candidate) *
    togetherLift(candidate, context) *
    (candidate.isBookmarked ? BOOKMARK_MULT : 1) *
    sameDay;

  return score < NOISE_MIN_SCORE ? null : score;
}
