import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { toZonedDate, useTimeZone } from '@/shared/time';

/**
 * How coarsely the clock is read. Suggestions shift with the hour, so a quarter hour is fine
 * grained enough to tell breakfast from mid-morning, and coarse enough that the query key
 * changes four times an hour instead of sixty.
 */
export const MINUTES_PER_BUCKET = 15;

/** A moment past the mark, so the timer never lands a hair before the bucket it waits for. */
const SETTLE_MS = 1000;

export interface MinuteBucket {
  /** Minutes past local midnight, rounded down to the bucket. What the server is asked for. */
  minute: number;
  /** The bucket index. What the query key rides on. */
  bucket: number;
}

/**
 * The local clock, in quarter hours. Built the same way as `useToday`: a phone keeps this
 * screen mounted for days, so the time is re-read when the app comes back to the foreground,
 * when the zone changes, and on every quarter-hour mark — never on a render.
 */
export function useMinuteBucket(): MinuteBucket {
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

  const zoned = useMemo(() => toZonedDate(now, timeZone), [now, timeZone]);
  const bucket = Math.floor((zoned.getHours() * 60 + zoned.getMinutes()) / MINUTES_PER_BUCKET);

  useEffect(() => {
    const intoBucket =
      ((zoned.getMinutes() % MINUTES_PER_BUCKET) * 60 + zoned.getSeconds()) * 1000;
    const timer = setTimeout(
      () => setNow(new Date()),
      MINUTES_PER_BUCKET * 60 * 1000 - intoBucket + SETTLE_MS,
    );

    return () => clearTimeout(timer);
  }, [zoned]);

  return { minute: bucket * MINUTES_PER_BUCKET, bucket };
}
