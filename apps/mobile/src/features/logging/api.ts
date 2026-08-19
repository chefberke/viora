import { apiFetch } from '@/shared/lib';
import type {
  DeleteEntryResponse,
  EntriesResponse,
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
