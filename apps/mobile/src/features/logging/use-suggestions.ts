import { useQuery } from '@tanstack/react-query';

import type { SuggestionDto } from '@/shared/api-types';
import { fetchSuggestions, suggestionsKey } from './api';
import { useMinuteBucket } from './use-minute-bucket';

/**
 * How many the composer offers. Three is what fits under a row without the suggestions
 * becoming the page; the endpoint sends a few more so one can be dropped without a refetch.
 */
export const MAX_SHOWN_SUGGESTIONS = 3;

/**
 * Longer than the app-wide 30 seconds. The answer only moves when the clock crosses a quarter
 * hour — which changes the key anyway — or when the day's entries change, which invalidates
 * this explicitly from the parser. Refetching on every remount in between is pure noise.
 */
const STALE_MS = 5 * 60 * 1000;

/** What to offer on an empty row of `day`, best first, already cut to what is shown. */
export function useSuggestions(day: number): SuggestionDto[] {
  const { minute, bucket } = useMinuteBucket();

  const { data } = useQuery({
    queryKey: suggestionsKey(day, bucket),
    queryFn: () => fetchSuggestions(day, minute),
    staleTime: STALE_MS,
  });

  return (data?.suggestions ?? []).slice(0, MAX_SHOWN_SUGGESTIONS);
}
