import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { entriesDayKey, fetchEntriesByDay } from './api';
import { sumTotals, type MacroTotals } from '@/shared/macros';

export interface UseDayTotalsResult {
  totals: MacroTotals;
  waterMl: number;
}

/**
 * What a day adds up to, read from the day's own query rather than from the composer.
 *
 * A sheet cannot see `useEntryParser`'s row states — those live on the log screen. It does
 * not need to: the parser writes every result it gets back into this same query, so the
 * two are the same numbers from the same parses.
 */
export function useDayTotals(day: number): UseDayTotalsResult {
  const { data } = useQuery({
    queryKey: entriesDayKey(day),
    queryFn: () => fetchEntriesByDay(day),
  });

  return useMemo(() => sumTotals(data?.entries ?? []), [data]);
}
