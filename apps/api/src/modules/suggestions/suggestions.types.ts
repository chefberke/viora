/** The shapes the suggestion engine folds a history into, and scores. */

/**
 * One thing the user eats, gathered from every time they logged it. The key is the normalized
 * wording, so "2 Eggs" and "2 eggs" are one candidate with two sightings.
 */
export interface CandidateStats {
  key: string;
  /** The wording to offer, taken from the most recent sighting. */
  text: string;
  isBookmarked: boolean;
  /** False for a bookmark that has never been logged. */
  hasHistory: boolean;
  /** Days it was logged on, not counting today. */
  distinctDays: number;
  /** How many of those fell on the same weekday as today. */
  sameDowDays: number;
  /** Null for a bookmark that has never been logged. */
  lastDay: number | null;
  /** Half-hour buckets of when it was logged. Sums to `timedCount`, not to the total count. */
  histogram: readonly number[];
  /** Sightings that carried a time at all. Everything else is silent about the hour. */
  timedCount: number;
  /** Days it was logged two or more times — the evidence that it is a repeatable thing. */
  repeatDays: number;
  /** The most times it was ever logged in one day. */
  maxPerDay: number;
  /** Times it has been logged today already. */
  timesToday: number;
  /** The latest time it was logged today, or null when today's rows carry no times. */
  lastMinuteToday: number | null;
}

/**
 * A key logged today that is established enough to pull others up with it: "you had coffee,
 * and on the days you have coffee you usually have toast".
 */
export interface TogetherPartner {
  /** Days this partner appears on across the window. */
  daysWith: number;
  /** For each other key, the days the two were logged together. */
  coDays: ReadonlyMap<string, number>;
}

/** Everything the scorer needs that is not about one particular candidate. */
export interface ScoreContext {
  /** Today, as the client's own calendar sees it. */
  day: number;
  /** Minutes past the client's local midnight. */
  minute: number;
  /** Days the user logged anything at all. Habit strength is read relative to this. */
  activeDays: number;
  partners: readonly TogetherPartner[];
}

/** A whole history, folded and ready to score. Cacheable: it does not depend on the minute. */
export interface HistoryAggregate {
  activeDays: number;
  candidates: CandidateStats[];
  partners: TogetherPartner[];
}
