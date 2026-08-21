/**
 * Reads parses that were written before a shape change.
 *
 * A `ParseResult` lives inside a jsonb column, so renaming a field on it renames nothing
 * that is already stored: `log_entries.result` and `saved_meals.result` keep whatever shape
 * they had on the day they were written, and no drizzle migration touches them. The mobile
 * app also hands a stored snapshot straight back when a meal is bookmarked, so an older
 * install can post the older shape long after the server moved on.
 *
 * Two changes live here so far:
 *
 * - `fdcId`, a number, became `sourceId`, a string, when Open Food Facts joined USDA and
 *   the two id spaces had to share one field.
 * - The correction loop gave `ParsedItem` a `per100g`, a `candidates` list and the
 *   `needsReview` / `corrected` flags. A row written before it has none of them, and the
 *   client renders `undefined` as a missing field rather than an absent one, so they are
 *   filled in on the way out. An old row simply offers no alternatives to pick from.
 */
import type { ParseResult, ParsedItem, ParseSource } from '../../types/index.ts';

/** The shape before the rename. Both carried the same key, so one guard covers both. */
interface LegacyId {
  fdcId?: number | null;
  sourceId?: string | null;
}

/** The fields a pre-correction-loop item is missing. */
type PartialItem = ParsedItem &
  LegacyId & {
    per100g?: ParsedItem['per100g'];
    candidates?: ParsedItem['candidates'];
    needsReview?: boolean;
    corrected?: boolean;
  };

function needsRewrite(value: LegacyId): boolean {
  return value.sourceId === undefined && value.fdcId !== undefined;
}

function rewrite<T extends LegacyId>(value: T): T {
  const { fdcId, ...rest } = value;

  return { ...rest, sourceId: fdcId === null || fdcId === undefined ? null : String(fdcId) } as T;
}

function needsFill(item: PartialItem): boolean {
  return item.candidates === undefined || item.per100g === undefined;
}

function fill(item: PartialItem): ParsedItem {
  return {
    ...item,
    per100g: item.per100g ?? null,
    candidates: item.candidates ?? [],
    needsReview: item.needsReview ?? false,
    corrected: item.corrected ?? false,
  };
}

/**
 * Returns the parse in the current shape. The row is handed back untouched when it already
 * is in it, which is every row written since the last change — the copy is only paid for by
 * the old ones.
 */
export function normalizeStoredResult(result: ParseResult | null): ParseResult | null {
  if (!result) {
    return null;
  }

  const items = (result.items ?? []) as PartialItem[];
  const sources = (result.sources ?? []) as (ParseSource & LegacyId)[];

  if (!items.some(needsRewrite) && !items.some(needsFill) && !sources.some(needsRewrite)) {
    return result;
  }

  return {
    ...result,
    items: items.map((item) => fill(needsRewrite(item) ? rewrite(item) : item)),
    sources: sources.map((source) => (needsRewrite(source) ? rewrite(source) : source)),
  };
}
