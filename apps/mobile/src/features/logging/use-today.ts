import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { toZonedDate, useTimeZone } from '@/shared/time';

const HOUR_MS = 60 * 60 * 1000;

/** A moment past the mark, so the timer never lands a hair before the hour it waits for. */
const SETTLE_MS = 1000;

/**
 * Today, told in the zone the app is set to. A phone keeps this screen mounted for days,
 * so the date is re-read on three occasions rather than once at mount: when the app comes
 * back to the foreground, when the zone changes, and on every hour mark.
 *
 * The hour mark is enough for everything that reads this. The greeting turns over at
 * 05:00, 12:00 and 18:00 and the day itself at midnight, and all four are hour marks.
 */
export function useToday(): Date {
  const timeZone = useTimeZone();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
      }
    });

    return () => subscription.remove();
  }, []);

  const today = useMemo(() => toZonedDate(now, timeZone), [now, timeZone]);

  // Measured on the zoned clock, because not every zone turns the hour on the device's
  // minute: some are half an hour or three quarters off.
  useEffect(() => {
    const intoHour = (today.getMinutes() * 60 + today.getSeconds()) * 1000;
    const timer = setTimeout(() => setNow(new Date()), HOUR_MS - intoHour + SETTLE_MS);

    return () => clearTimeout(timer);
  }, [today]);

  return today;
}
