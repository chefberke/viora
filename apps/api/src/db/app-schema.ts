import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import type { ParsedItem, ParseResult } from '../types/parse.ts';

import { user } from './schema.ts';

/**
 * Why people leave. The one table here that deliberately outlives the account it describes
 * — which is why `user_id` carries no foreign key, unlike every other table in this file.
 *
 * That makes what it holds a privacy question rather than a schema one, and the answer is
 * that it holds nothing identifying. It used to store the email address too, and there was
 * no use for it: there is no mail provider in this app, so nobody was ever going to be
 * written to. Hashing it would have been theatre — an email is short enough that a hash of
 * one is reversible by dictionary. The answer to "why did people leave" is `reason` and
 * `created_at`, and once the user row is gone `user_id` is a random string pointing at
 * nothing.
 */
export const accountDeletionFeedback = pgTable('account_deletion_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  /** A `DELETION_REASONS` id, not its label, so the copy can change. */
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const logEntries = pgTable(
  'log_entries',
  {
    /** Client-generated UUID, so retries and re-parses of a row stay one entry. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** YYYYMMDD int, the same shape as the mobile `toDayNumber` helper. */
    day: integer('day').notNull(),
    /**
     * Minutes past local midnight, 0-1439, or null. The device works it out from the same
     * wall clock `day` comes from, so no timezone ever has to reach the server. It is what
     * the suggestions engine learns your hours from.
     *
     * Null on every row written before the column existed, and on any row logged onto a day
     * that is not today — a dinner typed in at 23:00 for yesterday knows nothing about when
     * that dinner was eaten, and a guess would be worse than an absence.
     */
    minuteOfDay: integer('minute_of_day'),
    rawText: text('raw_text').notNull(),
    /** The client's edit counter. Writes compare-and-set on it, so a stale parse loses. */
    revision: integer('revision').notNull(),
    status: text('status').notNull(),
    /** Null while the entry is failed. */
    kind: text('kind'),
    result: jsonb('result').$type<ParseResult | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('log_entries_user_day_idx').on(table.userId, table.day)],
);

/**
 * A bookmarked meal: the line, and the parse it had when it was saved. The snapshot is what
 * makes re-adding one free — nothing is re-parsed until the text itself is edited.
 *
 * Keyed on the normalized text as well as the id, so bookmarking the same meal twice updates
 * one row instead of collecting duplicates that differ only in spacing.
 */
export const savedMeals = pgTable(
  'saved_meals',
  {
    /** Client-generated UUID, the same convention as `log_entries`. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** `canonicalKey(text)` — the dedupe key, and the join back to the log history. */
    normalizedKey: text('normalized_key').notNull(),
    status: text('status').notNull(),
    result: jsonb('result').$type<ParseResult | null>(),
    /** The entry it was bookmarked from, kept for provenance. Null once that entry is gone. */
    sourceEntryId: text('source_entry_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('saved_meals_user_key_unique').on(table.userId, table.normalizedKey),
    index('saved_meals_user_idx').on(table.userId),
  ],
);

/** One row per pipeline run, success or failure — the observability record. */
export const parseTraces = pgTable(
  'parse_traces',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The `x-request-id` of the HTTP request that ran the parse. */
    requestId: text('request_id').notNull(),
    revision: integer('revision').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    /**
     * The meal line exactly as the person typed it, which is the most personal thing in
     * this schema: what somebody eats, against their user id, with a timestamp.
     *
     * It is here because a wrong parse cannot be diagnosed without the text that produced
     * it. It is not here forever: `npm run retention` blanks it past
     * `TRACE_RETENTION_DAYS`, leaving the row and everything measurable on it — latency,
     * tokens, source, confidence, error code — none of which says anything about a
     * person. The row also cascades away entirely when the account does.
     */
    inputText: text('input_text').notNull(),
    /** 0 or 1, not a count. What each food database did is in `parse_trace_lookups`. */
    llmCacheHit: integer('llm_cache_hit').notNull(),
    llmLatencyMs: integer('llm_latency_ms'),
    totalLatencyMs: integer('total_latency_ms').notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    /** 'usda' | 'off' | 'llm_estimate' | 'mixed' | 'water', or null on failure. */
    source: text('source'),
    confidence: real('confidence'),
    /** A pipeline taxonomy code, set only when the run failed. */
    errorCode: text('error_code'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  // Nothing here was indexed. Both of these back questions the table exists to answer and
  // neither can be asked without them: "what has this user been parsing lately", which is
  // how a correction is traced back to the parse that earned it, and "what is failing",
  // which is a scan of every trace ever written until an index says otherwise.
  (table) => [
    index('parse_traces_user_created_idx').on(table.userId, table.createdAt),
    index('parse_traces_error_code_idx').on(table.errorCode),
  ],
);

/**
 * What one food database did for one parse. A child table rather than a column set per
 * provider: a third database is then a new value in `provider`, not four more columns on
 * a table that is already wide, and "how does each database compare" becomes one
 * `group by provider` instead of a query that has to know every provider by name.
 *
 * A provider that was switched off for a parse has no row, which is the truthful
 * reading: that parse never had it to ask.
 */
export const parseTraceLookups = pgTable(
  'parse_trace_lookups',
  {
    traceId: text('trace_id')
      .notNull()
      .references(() => parseTraces.id, { onDelete: 'cascade' }),
    /** A `FoodProvider`: 'usda' or 'off' today. Free text, so a new one needs no migration. */
    provider: text('provider').notNull(),
    /** Names this database was actually asked about, over the network. */
    lookups: integer('lookups').notNull(),
    /** Names answered from the cache instead. */
    cacheHits: integer('cache_hits').notNull(),
    /** Names never put to it at all: nothing to gain, or a spent rate budget. */
    skipped: integer('skipped').notNull(),
    /**
     * Names it was asked and could not answer. `> 0` is this provider degrading for this
     * parse — a count rather than a flag, because it says how much of the row lost its
     * grounding, and per provider rather than per trace, because USDA can be down while
     * Open Food Facts is fine and one boolean could not tell you which.
     */
    unreachable: integer('unreachable').notNull().default(0),
    /** This database's own wave, null when it made no call. The waves run side by side. */
    latencyMs: integer('latency_ms'),
  },
  (table) => [primaryKey({ columns: [table.traceId, table.provider] })],
);

/**
 * Every correction a person has made to a parse, append-only.
 *
 * This is the most valuable table in the schema and it is worth being explicit about why.
 * A parse is a guess; a correction is a person looking at that guess and saying what the
 * answer actually was. That is a ground-truth label, produced for free by someone who
 * wanted the number right for their own sake — the one kind of label nobody has to be
 * paid to write. The gold set is 126 cases because a human wrote 126 cases. This table is
 * how it reaches thousands.
 *
 * So nothing here is ever updated or overwritten. Correcting the same item twice writes
 * two rows, and the pair is itself informative: it says the first correction did not stick
 * and something about the choices offered was wrong. `revision` orders them against the
 * entry's own edit counter, and `before`/`after` carry the whole item on each side so the
 * label survives the parse being re-run.
 *
 * `trace_id` is the join back to the parse that earned the correction — which model,
 * which prompt version, which databases answered. Null when that trace has aged out;
 * a label with no provenance is still a label.
 */
export const entryCorrections = pgTable(
  'entry_corrections',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => logEntries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The parse this corrects. Null once the trace has been pruned. */
    traceId: text('trace_id'),
    /** The entry revision this was applied to. Orders corrections against edits. */
    revision: integer('revision').notNull(),
    /** Index into `result.items` at that revision. -1 for `add_item`, which has no index. */
    itemIndex: integer('item_index').notNull(),
    /** A `CORRECTION_TYPES` value. */
    type: text('type').notNull(),
    /** The item as the parser produced it. Null for `add_item`: there was nothing there. */
    before: jsonb('before').$type<ParsedItem | null>(),
    /** The item as the person meant it. Null for `remove_item`: they meant nothing there. */
    after: jsonb('after').$type<ParsedItem | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // The harvest reads this: every correction a user has made, newest first.
    index('entry_corrections_user_created_idx').on(table.userId, table.createdAt),
    // And the entry sheet reads this: what has already been corrected on this row.
    index('entry_corrections_entry_idx').on(table.entryId),
  ],
);

export const DELETION_REASONS = [
  'not_using',
  'missing_features',
  'found_alternative',
  'too_expensive',
  'privacy',
  'other',
] as const;

export type DeletionReason = (typeof DELETION_REASONS)[number];

export function isDeletionReason(value: unknown): value is DeletionReason {
  return typeof value === 'string' && (DELETION_REASONS as readonly string[]).includes(value);
}
