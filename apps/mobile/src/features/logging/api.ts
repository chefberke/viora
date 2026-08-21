import type { QueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/shared/lib';
import type {
  CorrectEntryRequest,
  CorrectEntryResponse,
  DeleteEntryResponse,
  EntriesResponse,
  FoodSearchResponse,
  ItemCandidate,
  LogEntryDto,
  LoggedDaysResponse,
  SuggestionsResponse,
  UpsertEntryRequest,
  UpsertEntryResponse,
} from '@/shared/api-types';

export const entriesDayKey = (day: number) => ['entries', day] as const;
export const entriesRangeKey = (from: number, to: number) => ['entries-range', from, to] as const;
export const loggedDaysKey = () => ['entries-days'] as const;
/**
 * Keyed on a quarter-hour rather than the minute: the ranking moves with the clock, but not
 * so fast that a fresh answer is worth a request every minute. Everything under `suggestions`
 * is invalidated together whenever the day's entries change.
 */
export const suggestionsKey = (day: number, quarterHour: number) =>
  ['suggestions', day, quarterHour] as const;
/**
 * Its own namespace, beside `entries` rather than under it. A food search answers a question
 * about the database, not about a day, and nesting it would put it in the path of every
 * invalidation an edit fires.
 */
export const foodSearchKey = (query: string) => ['foods-search', query] as const;

/** Everything under this key is what to suggest; a write to the day makes all of it wrong. */
const SUGGESTIONS_PREFIX = ['suggestions'] as const;

/**
 * What every write to a day has to touch besides the day itself.
 *
 * The water sheet reads a range query and the day walk reads the logged days; both are cheap
 * to refresh and wrong to leave stale. And what is already on today's plate is what must not
 * be suggested again, so that list is wrong the moment a row lands.
 */
function invalidateAround(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['entries-range'] });
  void queryClient.invalidateQueries({ queryKey: loggedDaysKey() });
  void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_PREFIX });
}

/**
 * Puts an entry the server has just confirmed into the day it belongs to.
 *
 * Written straight into the cache rather than only invalidated, because the screens reading
 * it are looking at the row right now: a sheet that dropped back to the old figures while a
 * refetch ran would flicker the correction away and back.
 */
export function applyEntryToCache(
  queryClient: QueryClient,
  day: number,
  entry: LogEntryDto,
): void {
  queryClient.setQueryData<EntriesResponse>(entriesDayKey(day), (old) => ({
    entries: [...(old?.entries ?? []).filter((item) => item.id !== entry.id), entry],
  }));
  invalidateAround(queryClient);
}

/** The same, for a row that is gone. */
export function dropEntryFromCache(queryClient: QueryClient, day: number, id: string): void {
  queryClient.setQueryData<EntriesResponse>(entriesDayKey(day), (old) => ({
    entries: (old?.entries ?? []).filter((item) => item.id !== id),
  }));
  invalidateAround(queryClient);
}

export function upsertEntry(id: string, body: UpsertEntryRequest): Promise<UpsertEntryResponse> {
  return apiFetch<UpsertEntryResponse>(`/api/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function fetchEntriesByDay(day: number): Promise<EntriesResponse> {
  return apiFetch<EntriesResponse>(`/api/entries?day=${day}`);
}

export function fetchEntriesRange(from: number, to: number): Promise<EntriesResponse> {
  return apiFetch<EntriesResponse>(`/api/entries?from=${from}&to=${to}`);
}

/** Every day the user has written something on. The day-to-day walk is built on it. */
export function fetchLoggedDays(): Promise<LoggedDaysResponse> {
  return apiFetch<LoggedDaysResponse>('/api/entries/days');
}

export function deleteEntry(id: string): Promise<DeleteEntryResponse> {
  return apiFetch<DeleteEntryResponse>(`/api/entries/${id}`, { method: 'DELETE' });
}

/**
 * What to offer on an empty composer row. The day and the minute are the device's own — the
 * server runs in UTC and cannot work out either one for us.
 */
export function fetchSuggestions(day: number, minute: number): Promise<SuggestionsResponse> {
  return apiFetch<SuggestionsResponse>(`/api/suggestions?day=${day}&minute=${minute}`);
}

export function correctEntry(
  id: string,
  body: CorrectEntryRequest,
): Promise<CorrectEntryResponse> {
  return apiFetch<CorrectEntryResponse>(`/api/entries/${id}/corrections`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Rows to pick from when none of an item's own candidates were the food.
 *
 * The query is encoded: it is the first parameter in this file that is not a number, and a
 * meal written in Turkish carries both spaces and letters a URL cannot hold as they are.
 */
export async function searchFoods(query: string, language?: string): Promise<FoodSearchResponse> {
  const lang = language === undefined || language === '' ? '' : `&lang=${language}`;
  const body = await apiFetch<FoodSearchResponse>(
    `/api/foods/search?q=${encodeURIComponent(query)}${lang}`,
  );

  return { foods: Array.isArray(body?.foods) ? body.foods.filter(isCandidate) : [] };
}

/**
 * Whether a row the server sent back is really a food row.
 *
 * The only response in this file whose contents the client then hands BACK to the server as
 * fact: picking one of these posts its `per100g` in a `set_food`, and those four numbers are
 * what the meal is then priced from. The API checks them field by field on the way in for
 * exactly that reason, and a list that arrived malformed would otherwise reach the sheet as
 * a render crash rather than as a bad response.
 */
function isCandidate(value: unknown): value is ItemCandidate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;
  const per100g = row.per100g as Record<string, unknown> | undefined;

  return (
    (row.provider === 'usda' || row.provider === 'off') &&
    typeof row.id === 'string' &&
    typeof row.description === 'string' &&
    typeof per100g === 'object' &&
    per100g !== null &&
    ['kcal', 'protein', 'carbs', 'fat'].every((key) => typeof per100g[key] === 'number')
  );
}
