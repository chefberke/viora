import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchLoggedDays, loggedDaysKey } from './api';
import { daysBetween, fromDayNumber, toDayNumber } from './calendar';
import { useToday } from './use-today';

export interface UseSelectedDayResult {
  /** The day on screen, as a day number. */
  day: number;
  /** The same day as a date, for the labels. */
  date: Date;
  today: Date;
  isToday: boolean;
  /** How many days back the shown day sits. Zero on today. */
  daysBack: number;
  /** Days the user has written something on, oldest first. Today may or may not be in it. */
  loggedDays: readonly number[];
  /** True while there is an older logged day to step back to. */
  canGoBack: boolean;
  /** True while the day on screen is not today. */
  canGoForward: boolean;
  /** One step back, to the newest logged day older than this one. */
  goBack: () => void;
  /** One step forward, ending on today. */
  goForward: () => void;
  /** Jump straight to a day. Ignored unless the day can be reached. */
  select: (day: number) => void;
}

/**
 * Which day the log is showing, and how to walk between days.
 *
 * Only two kinds of day can be reached: today, and a past day the user wrote something
 * on. A day nobody logged holds nothing to read, and tomorrow has not happened — so the
 * walk is over the logged days plus today, not over the calendar.
 *
 * When midnight turns the day over, the screen returns to today on its own. The day that
 * ended is now a past day like any other, reached by stepping back to it.
 */
export function useSelectedDay(): UseSelectedDayResult {
  const today = useToday();
  const todayDay = toDayNumber(today);

  const { data } = useQuery({
    queryKey: loggedDaysKey(),
    queryFn: fetchLoggedDays,
  });

  const [day, setDay] = useState(todayDay);

  // The new day comes up empty and by itself; the day that ended stays behind, in the past.
  useEffect(() => {
    setDay(todayDay);
  }, [todayDay]);

  const loggedDays = useMemo(() => data?.days ?? [], [data]);

  // What the walk runs over. Today is always on it, even before anything is written on it;
  // a day the clock has not reached never is.
  const reachable = useMemo(() => {
    const past = loggedDays.filter((value) => value < todayDay);

    return [...past, todayDay];
  }, [loggedDays, todayDay]);

  // A day that is neither today nor logged any more (the last entry on it was removed)
  // still shows what it shows; the steps below simply walk away from it in either direction.
  const previousDay = useMemo(
    () => reachable.filter((value) => value < day).at(-1) ?? null,
    [reachable, day],
  );

  const nextDay = useMemo(
    () => reachable.find((value) => value > day) ?? null,
    [reachable, day],
  );

  const goBack = useCallback(() => {
    if (previousDay !== null) {
      setDay(previousDay);
    }
  }, [previousDay]);

  const goForward = useCallback(() => {
    if (nextDay !== null) {
      setDay(nextDay);
    }
  }, [nextDay]);

  const select = useCallback(
    (value: number) => {
      if (value === todayDay || loggedDays.includes(value)) {
        setDay(value);
      }
    },
    [loggedDays, todayDay],
  );

  return {
    day,
    date: day === todayDay ? today : fromDayNumber(day),
    today,
    isToday: day === todayDay,
    daysBack: daysBetween(todayDay, day),
    loggedDays,
    canGoBack: previousDay !== null,
    canGoForward: nextDay !== null,
    goBack,
    goForward,
    select,
  };
}
