/**
 * Blanks the raw meal text on parse traces older than the retention window.
 *
 * Anonymise rather than delete, and the reason is the correction ledger. A trace is what a
 * correction argues with — `entry_corrections.trace_id` points at it, and that link is
 * what `npm run eval:harvest` reads to turn a person's fix into a proposed gold case.
 * Dropping the rows would cut every old correction loose from the parse it corrects, and
 * the corrections are the most valuable thing in the schema. Blanking one column keeps the
 * provenance and the whole observability record — latency, tokens, source, confidence,
 * error code — while removing the only field that says anything about a person.
 *
 * Nothing schedules this. It is idempotent and safe to run twice, so a cron entry or a
 * scheduled job is the whole deployment story; a timer inside the server would run once
 * per instance and do the same work N times.
 */
import { and, lt, ne } from 'drizzle-orm';

import { env } from '../src/config/index.ts';
import { closeDatabase, db } from '../src/db/index.ts';
import { parseTraces } from '../src/db/app-schema.ts';
import { log } from '../src/utils/index.ts';

const cutoff = new Date(Date.now() - env.TRACE_RETENTION_DAYS * 24 * 3600 * 1000);

// `ne('')` keeps a second run from rewriting rows that are already blank, so the log line
// says how many were anonymised THIS time rather than how many are old.
const anonymised = await db
  .update(parseTraces)
  .set({ inputText: '' })
  .where(and(lt(parseTraces.createdAt, cutoff), ne(parseTraces.inputText, '')))
  .returning({ id: parseTraces.id });

log('retention_anonymised', {
  rows: anonymised.length,
  olderThan: cutoff.toISOString(),
  retentionDays: env.TRACE_RETENTION_DAYS,
});

await closeDatabase();
