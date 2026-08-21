/** Request guards for the entries routes. Nothing here touches the database. */
import type { ItemCandidate, UpsertEntryRequest } from '../../types/index.ts';
import { isEntryKind } from '../../types/index.ts';
import { badRequest } from '../../utils/index.ts';
import type { CorrectionOp } from './entries.corrections.ts';

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

/** How many edits one request may carry. A person reviewing a row makes a handful, not a hundred. */
const MAX_OPS = 20;
const MAX_NAME_LENGTH = 120;
const MAX_QUANTITY = 10_000;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw badRequest('invalid_item_index');
  }

  return value;
}

function asQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) {
    throw badRequest('invalid_quantity');
  }

  return value;
}

function asUnit(value: unknown): string {
  const unit = typeof value === 'string' ? value.trim().toLowerCase() : '';

  // Any unit string is allowed through, exactly as the pipeline allows one: a unit the
  // tables do not know converts by the item's own history or the stand-in, and refusing
  // "avuç" here would be refusing a word a person is entitled to type.
  if (unit === '' || unit.length > 32) {
    throw badRequest('invalid_unit');
  }

  return unit;
}

/** An optional explicit weight. Null and absent both mean "let the unit decide". */
function asGrams(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw badRequest('invalid_grams');
  }

  return value;
}

/**
 * A food row as the client hands it back. It is checked field by field rather than trusted,
 * because this is the one place a client supplies nutrition figures directly: a `set_food`
 * carries the row a person chose out of a search, and an unchecked `per100g` here would let
 * any number at all be logged as though a database had said it.
 */
function asCandidate(value: unknown): ItemCandidate {
  const input = asRecord(value);
  const per100g = asRecord(input.per100g);
  const numbers = ['kcal', 'protein', 'carbs', 'fat'].map((key) => per100g[key]);

  if (
    (input.provider !== 'usda' && input.provider !== 'off') ||
    typeof input.id !== 'string' ||
    input.id === '' ||
    typeof input.description !== 'string' ||
    numbers.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
  ) {
    throw badRequest('invalid_food');
  }

  const [kcal, protein, carbs, fat] = numbers as number[];

  return {
    provider: input.provider,
    id: input.id,
    description: input.description.slice(0, MAX_NAME_LENGTH),
    detail: typeof input.detail === 'string' ? input.detail.slice(0, MAX_NAME_LENGTH) : '',
    per100g: { kcal: kcal!, protein: protein!, carbs: carbs!, fat: fat! },
  };
}

function parseOp(value: unknown): CorrectionOp {
  const op = asRecord(value);

  switch (op.type) {
    case 'pick_candidate':
      return {
        type: 'pick_candidate',
        itemIndex: asIndex(op.itemIndex),
        candidateIndex: asIndex(op.candidateIndex),
      };

    case 'set_food':
      return { type: 'set_food', itemIndex: asIndex(op.itemIndex), food: asCandidate(op.food) };

    case 'set_portion':
      return {
        type: 'set_portion',
        itemIndex: asIndex(op.itemIndex),
        quantity: asQuantity(op.quantity),
        unit: asUnit(op.unit),
        grams: asGrams(op.grams),
      };

    case 'remove_item':
      return { type: 'remove_item', itemIndex: asIndex(op.itemIndex) };

    case 'add_item': {
      const name = typeof op.name === 'string' ? op.name.trim() : '';
      const kind = isEntryKind(op.kind) ? op.kind : 'food';

      if (name === '' || name.length > MAX_NAME_LENGTH) {
        throw badRequest('invalid_name');
      }

      return {
        type: 'add_item',
        name,
        quantity: asQuantity(op.quantity),
        unit: asUnit(op.unit),
        kind,
        grams: asGrams(op.grams),
        // Water needs no row; a food added without one is an estimate, and flagged as such.
        food: op.food === undefined || op.food === null ? null : asCandidate(op.food),
      };
    }

    default:
      throw badRequest('invalid_correction_type');
  }
}

/** The wire request, narrowed to the union the correction maths speaks. */
export interface CorrectionsBody {
  revision: number;
  ops: CorrectionOp[];
}

export function parseCorrectionsBody(body: unknown): CorrectionsBody {
  const input = asRecord(body);
  const revision = input.revision;

  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
    throw badRequest('invalid_body');
  }

  if (!Array.isArray(input.ops) || input.ops.length === 0 || input.ops.length > MAX_OPS) {
    throw badRequest('invalid_ops');
  }

  return { revision, ops: input.ops.map(parseOp) };
}
