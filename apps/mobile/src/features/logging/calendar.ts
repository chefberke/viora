const DAYS_IN_WEEK = 7;

/**
 * Sunday first, and two letters wide so no two columns read the same. The week starts
 * where the en-US locale starts it, which is the locale the date line already fixes.
 */
export const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Midnight on the first of the month that `date` falls in. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The start of the month `step` months away. A negative step goes back. */
export function addMonths(monthStart: Date, step: number): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + step, 1);
}

/**
 * A day written as one comparable number: 18 Aug 2026 -> 20260818. Two dates cannot be
 * ordered by day while they still carry a time, and this drops it.
 */
export function toDayNumber(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** "August 2026", in the same fixed locale as the greeting's date line. */
export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * The month around `date`, as rows of seven. `null` pads the days before the first and
 * after the last, so every row keeps its seven columns and every day sits under its own
 * weekday.
 */
export function buildMonthWeeks(date: Date): (number | null)[][] {
  const year = date.getFullYear();
  const month = date.getMonth();

  // Day 0 of the next month is the last day of this one, whatever its length.
  const dayCount = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1),
  ];

  while (cells.length % DAYS_IN_WEEK !== 0) {
    cells.push(null);
  }

  return Array.from({ length: cells.length / DAYS_IN_WEEK }, (_, week) =>
    cells.slice(week * DAYS_IN_WEEK, (week + 1) * DAYS_IN_WEEK),
  );
}
