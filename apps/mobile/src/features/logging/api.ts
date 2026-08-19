import { apiFetch } from '@/shared/lib';
import type {
  DeleteEntryResponse,
  EntriesResponse,
  LoggedDaysResponse,
  UpsertEntryRequest,
  UpsertEntryResponse,
} from './api-types';

export const entriesDayKey = (day: number) => ['entries', day] as const;
export const entriesRangeKey = (from: number, to: number) => ['entries-range', from, to] as const;
export const loggedDaysKey = () => ['entries-days'] as const;

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
