/**
 * Calendar maths on YYYYMMDD day numbers. Every function here is pure and clock-free: the
 * server runs in UTC and the user may be thirteen hours away, so "now" can only ever come
 * from the day and minute the client sent.
 */

/** The day number as a UTC instant, so two days can be subtracted without timezone drift. */
function dayToUtcMs(day: number): number {
  return Date.UTC(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100);
}

const MS_PER_DAY = 24 * 3600 * 1000;

/** Whole days from `from` to `to`. Negative when `to` is the earlier of the two. */
export function daysBetween(from: number, to: number): number {
  return Math.round((dayToUtcMs(to) - dayToUtcMs(from)) / MS_PER_DAY);
}

/** The same day number, moved by `delta` days. */
export function shiftDay(day: number, delta: number): number {
  const moved = new Date(dayToUtcMs(day) + delta * MS_PER_DAY);

  return (
    moved.getUTCFullYear() * 10000 + (moved.getUTCMonth() + 1) * 100 + moved.getUTCDate()
  );
}

/** 0 = Sunday, matching `Date.getUTCDay()`. Only ever compared with itself. */
export function weekdayOf(day: number): number {
  return new Date(dayToUtcMs(day)).getUTCDay();
}
