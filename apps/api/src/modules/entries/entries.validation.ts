/** Request guards for the entries routes. Nothing here touches the database. */
import type { UpsertEntryRequest } from '../../types/index.ts';
import { badRequest } from '../../utils/index.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RAW_TEXT_LENGTH = 500;
const MAX_RANGE_DAYS = 31;
/** Minutes in a day. A minute-of-day is 0..1439; 1440 is already tomorrow's midnight. */
export const MINUTES_PER_DAY = 1440;

/** Either one day or a bounded span — the two ways `GET /api/entries` can be asked. */
export type EntriesQuery = { kind: 'day'; day: number } | { kind: 'range'; from: number; to: number };

/** A YYYYMMDD int with a real calendar shape, or null. Shared with the suggestions guard. */
export function asDayNumber(value: unknown): number | null {
  const day = typeof value === 'string' ? Number(value) : value;

  if (typeof day !== 'number' || !Number.isInteger(day)) {
    return null;
  }

  const month = Math.floor(day / 100) % 100;
  const dayOfMonth = day % 100;
  const year = Math.floor(day / 10000);

  if (year < 2000 || year > 2100 || month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31) {
    return null;
  }

  return day;
}

function dayToDate(day: number): Date {
  return new Date(Date.UTC(Math.floor(day / 10000), (Math.floor(day / 100) % 100) - 1, day % 100));
}

export function requireUuid(value: unknown): string {
  const id = typeof value === 'string' ? value : '';

  if (!UUID_PATTERN.test(id)) {
    throw badRequest('invalid_id');
  }

  return id;
}

/** Loose id check for delete, which is idempotent and never leaks whether a row existed. */
export function requireId(value: unknown): string {
  const id = typeof value === 'string' ? value : '';

  if (id === '') {
    throw badRequest('invalid_id');
  }

  return id;
}

/** A minute-of-day, or null. Absent and explicitly null mean the same thing: no time known. */
export function asMinuteOfDay(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  const minute = typeof value === 'string' ? Number(value) : value;

  if (typeof minute !== 'number' || !Number.isInteger(minute)) {
    return null;
  }

  return minute >= 0 && minute < MINUTES_PER_DAY ? minute : null;
}

export function parseUpsertBody(body: unknown): UpsertEntryRequest {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const rawText = typeof input.rawText === 'string' ? input.rawText.trim() : '';
  const day = asDayNumber(input.day);
  const revision = input.revision;

  if (
    rawText === '' ||
    rawText.length > MAX_RAW_TEXT_LENGTH ||
    day === null ||
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    throw badRequest('invalid_body');
  }

  // A malformed minute is dropped rather than refused: the entry itself is still good, and
  // the suggestions engine treats a missing time as neutral anyway.
  return { rawText, day, revision, minuteOfDay: asMinuteOfDay(input.minuteOfDay) };
}

export function parseEntriesQuery(query: Record<string, unknown>): EntriesQuery {
  const hasDay = query.day !== undefined;
  const hasRange = query.from !== undefined || query.to !== undefined;

  // Exactly one of the two forms: neither and both are equally unanswerable.
  if (hasDay === hasRange) {
    throw badRequest('invalid_range');
  }

  if (hasDay) {
    const day = asDayNumber(query.day);

    if (day === null) {
      throw badRequest('invalid_range');
    }

    return { kind: 'day', day };
  }

  const from = asDayNumber(query.from);
  const to = asDayNumber(query.to);

  if (from === null || to === null || from > to) {
    throw badRequest('invalid_range');
  }

  const spanMs = dayToDate(to).getTime() - dayToDate(from).getTime();

  if (spanMs > MAX_RANGE_DAYS * 24 * 3600 * 1000) {
    throw badRequest('invalid_range');
  }

  return { kind: 'range', from, to };
}
