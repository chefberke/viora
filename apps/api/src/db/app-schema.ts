import { index, integer, jsonb, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';

import type { ParseResult } from '../types/parse.ts';

import { user } from './schema.ts';

export const accountDeletionFeedback = pgTable('account_deletion_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
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

/** One row per pipeline run, success or failure — the observability record. */
export const parseTraces = pgTable('parse_traces', {
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
  inputText: text('input_text').notNull(),
  /** 0 or 1, not a count like the fields below it. */
  llmCacheHit: integer('llm_cache_hit').notNull(),
  usdaLookups: integer('usda_lookups').notNull(),
  usdaCacheHits: integer('usda_cache_hits').notNull(),
  llmLatencyMs: integer('llm_latency_ms'),
  usdaLatencyMs: integer('usda_latency_ms'),
  totalLatencyMs: integer('total_latency_ms').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  /** 'usda' | 'llm_estimate' | 'mixed' | 'water', or null on failure. */
  source: text('source'),
  confidence: real('confidence'),
  /** A pipeline taxonomy code, set only when the run failed. */
  errorCode: text('error_code'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
