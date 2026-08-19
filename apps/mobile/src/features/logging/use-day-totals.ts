import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { entriesDayKey, fetchEntriesByDay } from './api';
import type { MacroTotals } from '@/shared/macros';

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

  return useMemo(() => {
    let calories = 0;
    let carbs = 0;
    let protein = 0;
    let fat = 0;
    let waterMl = 0;

    for (const entry of data?.entries ?? []) {
      const totals = entry.result?.totals;

      if (!totals) {
        continue;
      }

      calories += totals.calories;
      carbs += totals.carbs;
      protein += totals.protein;
      fat += totals.fat;
      waterMl += totals.waterMl;
    }

    return {
      totals: {
        calories,
        carbs: Math.round(carbs),
        protein: Math.round(protein),
        fat: Math.round(fat),
      },
      waterMl,
    };
  }, [data]);
}
