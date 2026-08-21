/** Request guards for the saved-meals routes. Nothing here touches the database. */
import type {
  ItemCandidate,
  Nutrition100g,
  ParsedItem,
  ParseResult,
  SaveMealRequest,
} from '../../types/index.ts';
import { isEntryKind } from '../../types/index.ts';
import { buildSources, rowKind, sumTotals } from '../entries/entries.assemble.ts';
import { confidenceLevel, overallConfidence } from '../entries/entries.confidence.ts';
import { badRequest } from '../../utils/index.ts';

const MAX_TEXT_LENGTH = 500;
const MAX_ITEMS = 20;
const MAX_CANDIDATES = 3;
const MAX_NAME_LENGTH = 200;
const MAX_PROSE_LENGTH = 2000;

const ITEM_SOURCES = ['usda', 'off', 'llm_estimate', 'water'] as const;
const PROVIDERS = ['usda', 'off'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A finite number, or null. A string that looks like one is not one. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null;
}

function member<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function readNutrition(value: unknown): Nutrition100g | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const kcal = num(record.kcal);
  const protein = num(record.protein);
  const carbs = num(record.carbs);
  const fat = num(record.fat);

  if (kcal === null || protein === null || carbs === null || fat === null) {
    return null;
  }

  return { kcal, protein, carbs, fat };
}

function readCandidate(value: unknown): ItemCandidate | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const provider = member(record.provider, PROVIDERS);
  const id = text(record.id, MAX_NAME_LENGTH);
  const description = text(record.description, MAX_NAME_LENGTH);
  const detail = text(record.detail, MAX_NAME_LENGTH);
  const per100g = readNutrition(record.per100g);

  if (provider === null || id === null || description === null || detail === null || per100g === null) {
    return null;
  }

  return { provider, id, description, detail, per100g };
}

/**
 * The row's id in its own database, taking the pre-rename `fdcId` when that is what
 * arrived.
 *
 * The same rename is handled on the read path by `entries.compat.ts`, but that shim runs
 * on data the server itself wrote and does unchecked property access — it would throw on
 * hostile JSON. It cannot be the thing that meets a request body first, so the one field
 * an old client still sends in the old shape is accepted here instead, and the compat
 * pass stays where it belongs: reading rows out of the database.
 */
function readSourceId(record: Record<string, unknown>): string | null {
  const current = text(record.sourceId, MAX_NAME_LENGTH);

  if (current !== null || record.sourceId !== undefined) {
    return current;
  }

  const legacy = num(record.fdcId);

  return legacy === null ? null : String(legacy);
}

function readItem(value: unknown): ParsedItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const name = text(record.name, MAX_NAME_LENGTH);
  const unit = text(record.unit, MAX_NAME_LENGTH);
  const quantity = num(record.quantity);
  const calories = num(record.calories);
  const protein = num(record.protein);
  const carbs = num(record.carbs);
  const fat = num(record.fat);
  const confidence = num(record.confidence);
  const source = member(record.source, ITEM_SOURCES);

  if (
    name === null ||
    unit === null ||
    quantity === null ||
    calories === null ||
    protein === null ||
    carbs === null ||
    fat === null ||
    confidence === null ||
    source === null ||
    !isEntryKind(record.kind)
  ) {
    return null;
  }

  // Every candidate has to read, not most of them: a partially readable list would
  // silently narrow what a person is offered when the food turns out to be wrong.
  const rawCandidates = Array.isArray(record.candidates) ? record.candidates : [];
  const candidates = rawCandidates.slice(0, MAX_CANDIDATES).map(readCandidate);

  if (candidates.some((candidate) => candidate === null)) {
    return null;
  }

  return {
    name,
    quantity,
    unit,
    grams: num(record.grams),
    ml: num(record.ml),
    kind: record.kind,
    calories,
    protein,
    carbs,
    fat,
    source,
    sourceId: readSourceId(record),
    matchedDescription: text(record.matchedDescription, MAX_NAME_LENGTH),
    confidence,
    per100g: readNutrition(record.per100g),
    candidates: candidates as ItemCandidate[],
    needsReview: record.needsReview === true,
    corrected: record.corrected === true,
  };
}

/**
 * A `ParseResult` sent up by a client, or null if it is not one.
 *
 * This used to be passed through unchecked, and the comment that justified it argued there
 * was "no third case worth validating a whole ParseResult shape for": either the client
 * sends back a parse this server produced a moment ago, or it sends nothing. The first
 * half is true and the second is the hole — nothing made the client send back what it was
 * given. Whatever arrived was written to `saved_meals.result` as jsonb, handed to every
 * later reader of the meal, and read by the suggestions aggregate through
 * `result->>'normalizedText'`. That is the third case: the snapshot is stored, rendered as
 * nutrition and re-added to a diary without ever passing through the pipeline again.
 *
 * The items are checked field by field. Everything derived from them — the row's kind, the
 * confidence, the totals and the source list — is then RECOMPUTED rather than read, using
 * the same four helpers a correction uses (`entries.corrections.ts`). So a client cannot
 * post totals that disagree with its own items, and "the total is the sum of what is above
 * it" stays an invariant enforced in one place instead of a claim the wire is trusted for.
 *
 * Anything unreadable comes back as null rather than as a 400, because null already means
 * exactly the right thing here: the server parses the text itself. A malformed snapshot
 * costs one parse, not an error.
 */
export function readStoredResult(value: unknown): ParseResult | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const normalizedText = text(record.normalizedText, MAX_TEXT_LENGTH);
  const reasoning = text(record.reasoning, MAX_PROSE_LENGTH);

  if (normalizedText === null || reasoning === null || !Array.isArray(record.items)) {
    return null;
  }

  const read = record.items.slice(0, MAX_ITEMS).map(readItem);

  if (read.some((item) => item === null)) {
    return null;
  }

  const items = read as ParsedItem[];

  // An empty snapshot is not a parse. Letting it through would store a saved meal with no
  // food and a zero total, which reads on the phone as a meal someone logged as nothing.
  if (items.length === 0) {
    return null;
  }

  const confidence = overallConfidence(items);

  return {
    kind: rowKind(items),
    normalizedText,
    reasoning,
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    items,
    totals: sumTotals(items),
    sources: buildSources(items),
  };
}

/**
 * A saved meal's body. `result` is optional: absent, or unreadable, and the server parses
 * the text itself.
 */
export function parseSaveMealBody(body: unknown): SaveMealRequest {
  const input = asRecord(body) ?? {};
  const rawText = typeof input.text === 'string' ? input.text.trim() : '';

  if (rawText === '' || rawText.length > MAX_TEXT_LENGTH) {
    throw badRequest('invalid_body');
  }

  return {
    text: rawText,
    result: readStoredResult(input.result),
    sourceEntryId: typeof input.sourceEntryId === 'string' ? input.sourceEntryId : null,
  };
}
