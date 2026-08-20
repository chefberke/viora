/**
 * Reads parses that were written before a shape change.
 *
 * A `ParseResult` lives inside a jsonb column, so renaming a field on it renames nothing
 * that is already stored: `log_entries.result` and `saved_meals.result` keep whatever shape
 * they had on the day they were written, and no drizzle migration touches them. The mobile
 * app also hands a stored snapshot straight back when a meal is bookmarked, so an older
 * install can post the older shape long after the server moved on.
 *
 * One rename lives here so far: `fdcId`, a number, became `sourceId`, a string, when Open
 * Food Facts joined USDA and the two id spaces had to share one field.
 */
import type { ParseResult, ParsedItem, ParseSource } from '../../types/index.ts';

/** The shape before the rename. Both carried the same key, so one guard covers both. */
interface LegacyId {
  fdcId?: number | null;
  sourceId?: string | null;
}

function needsRewrite(value: LegacyId): boolean {
  return value.sourceId === undefined && value.fdcId !== undefined;
}

function rewrite<T extends LegacyId>(value: T): T {
  const { fdcId, ...rest } = value;

  return { ...rest, sourceId: fdcId === null || fdcId === undefined ? null : String(fdcId) } as T;
}

/**
 * Returns the parse in the current shape. The row is handed back untouched when it already
 * is in it, which is every row written since the rename — the copy is only paid for by the
 * old ones.
 */
export function normalizeStoredResult(result: ParseResult | null): ParseResult | null {
  if (!result) {
    return null;
  }

  const items = (result.items ?? []) as (ParsedItem & LegacyId)[];
  const sources = (result.sources ?? []) as (ParseSource & LegacyId)[];

  if (!items.some(needsRewrite) && !sources.some(needsRewrite)) {
    return result;
  }

  return {
    ...result,
    items: items.map((item) => (needsRewrite(item) ? rewrite(item) : item)),
    sources: sources.map((source) => (needsRewrite(source) ? rewrite(source) : source)),
  };
}
