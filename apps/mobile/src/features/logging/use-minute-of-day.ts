import { useCallback } from 'react';

import { toZonedDate, useTimeZone } from '@/shared/time';
import { toDayNumber } from './calendar';

/**
 * When a row is being eaten, in minutes past local midnight — the signal suggestions learn
 * a person's hours from.
 *
 * Read from the clock on each call rather than from `useToday`, which only re-renders on
 * the hour and so would hand back a time up to an hour stale. Only today gets one: writing
 * yesterday's dinner in at 23:00 says nothing about when that dinner was eaten, and the
 * server keeps the first value it is given, so a wrong guess here would be permanent.
 *
 * It lives in `features/logging/` and not in `shared/time/` despite being a time helper:
 * `toDayNumber` is this feature's own day encoding, and `shared/` may not import from a
 * feature.
 */
export function useMinuteOfDay(): (day: number) => number | null {
  const timeZone = useTimeZone();

  return useCallback(
    (day: number): number | null => {
      const now = toZonedDate(new Date(), timeZone);

      if (toDayNumber(now) !== day) {
        return null;
      }

      return now.getHours() * 60 + now.getMinutes();
    },
    [timeZone],
  );
}
