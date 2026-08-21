/**
 * Everything the entries routes do once the request is known to be well formed: the
 * database reads and writes, the parse pipeline call, and the trace row that records it.
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { entryCorrections, logEntries, parseTraces } from '../../db/app-schema.ts';
import type { SessionUser } from '../../lib/auth.ts';
import { recordCorrections, tracedParse } from '../../lib/braintrust.ts';
import type { LogEntryDto } from '../../types/index.ts';
import { badRequest, conflict, notFound } from '../../utils/index.ts';
import { normalizeStoredResult } from './entries.compat.ts';
import { applyCorrections } from './entries.corrections.ts';
import { isPipelineError, toHttpError, type PipelineError } from './entries.errors.ts';
import { parseRow } from './entries.pipeline.ts';
import { newTraceId, writeParseTrace } from './entries.trace.ts';
import type { ParseOutcome } from './entries.types.ts';
import type { CorrectionsBody, EntriesQuery } from './entries.validation.ts';

export interface UpsertEntryInput {
  id: string;
  user: SessionUser;
  requestId: string;
  rawText: string;
  day: number;
  revision: number;
  minuteOfDay: number | null;
}

function toDto(row: typeof logEntries.$inferSelect): LogEntryDto {
  return {
    id: row.id,
    day: row.day,
    minuteOfDay: row.minuteOfDay,
    rawText: row.rawText,
    revision: row.revision,
    status: row.status as LogEntryDto['status'],
    result: normalizeStoredResult(row.result ?? null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Parses one composer row and stores it. Throws the HTTP error the client should see;
 * the trace row is written either way, so a failed parse is still measurable.
 */
export async function upsertEntry(input: UpsertEntryInput): Promise<LogEntryDto> {
  const { id, user, rawText, day, revision, minuteOfDay } = input;
  const existing = await db.query.logEntries.findFirst({ where: eq(logEntries.id, id) });

  // Someone else's id: pretend it does not exist rather than confirm it does.
  if (existing && existing.userId !== user.id) {
    throw notFound();
  }

  if (existing) {
    if (revision < existing.revision) {
      throw conflict('revision_conflict');
    }

    // Idempotent replay: the same edit again returns the stored parse for free. It returns
    // before the write below, so a replay never fills in a minute the first write missed —
    // which is correct, not an oversight: only the first write is allowed to set the time.
    if (
      revision === existing.revision &&
      existing.rawText === rawText &&
      existing.status === 'parsed'
    ) {
      return toDto(existing);
    }
  }

  const startedAt = performance.now();
  const traceId = newTraceId();
  let outcome: ParseOutcome | null = null;
  let pipelineError: PipelineError | null = null;

  try {
    // The Braintrust span wraps the parse and nothing else. Everything after it — the
    // upsert, the read-back, the trace row — is bookkeeping this API does the same way for
    // a dozen other routes, and putting it inside the span would time the database as
    // though it were the model.
    outcome = await tracedParse(
      { traceId, entryId: id, userId: user.id, requestId: input.requestId, revision, inputText: rawText },
      () => parseRow(rawText),
    );
  } catch (error) {
    if (!isPipelineError(error)) {
      throw error;
    }

    pipelineError = error;
  }

  const values = {
    rawText,
    day,
    revision,
    status: outcome ? ('parsed' as const) : ('failed' as const),
    kind: outcome?.result.kind ?? null,
    result: outcome?.result ?? null,
    updatedAt: new Date(),
  };

  // Compare-and-set: a slow old parse arriving after a newer edit must not win.
  await db
    .insert(logEntries)
    .values({ id, userId: user.id, minuteOfDay, ...values })
    .onConflictDoUpdate({
      target: logEntries.id,
      set: {
        ...values,
        // First write wins. Correcting a typo at 23:00 must not move a 09:00 breakfast to
        // dinner, so an existing time is never overwritten — but a row that has none yet
        // (an old row, or one whose first write carried no time) can still be given one.
        minuteOfDay: sql`coalesce(${logEntries.minuteOfDay}, excluded.minute_of_day)`,
      },
      setWhere: sql`${logEntries.revision} <= ${revision}`,
    });

  const stored = await db.query.logEntries.findFirst({ where: eq(logEntries.id, id) });

  if (!stored) {
    throw notFound();
  }

  await writeParseTrace({
    traceId,
    entryId: id,
    userId: user.id,
    requestId: input.requestId,
    revision,
    inputText: rawText,
    outcome,
    errorCode: pipelineError?.code ?? null,
    startedAt,
  });

  if (pipelineError) {
    throw toHttpError(pipelineError);
  }

  return toDto(stored);
}

export interface CorrectEntryInput {
  id: string;
  user: SessionUser;
  revision: number;
  ops: CorrectionsBody['ops'];
}

/**
 * Applies a person's corrections to a stored parse.
 *
 * No model is called and no food database is asked. Everything the edit needs — the row the
 * item was priced from, the rows that lost — is already on the item, put there by the parse
 * that produced it. A correction is arithmetic, and pricing it any other way would mean
 * spending a metered call to be told something the user has already told us.
 *
 * The write is the same compare-and-set the composer uses, with one difference: the client
 * must name the exact revision it is correcting. An upsert may arrive stale and lose
 * quietly, because the newer text supersedes it. A correction cannot — "swap item 2 for the
 * third candidate" is a sentence about a specific list, and applying it to a different list
 * would silently edit a food nobody looked at.
 */
export async function correctEntry(input: CorrectEntryInput): Promise<LogEntryDto> {
  const { id, user, revision, ops } = input;
  const existing = await db.query.logEntries.findFirst({ where: eq(logEntries.id, id) });

  // Someone else's id: pretend it does not exist rather than confirm it does.
  if (!existing || existing.userId !== user.id) {
    throw notFound();
  }

  if (existing.revision !== revision) {
    throw conflict('revision_conflict');
  }

  const stored = normalizeStoredResult(existing.result ?? null);

  if (existing.status !== 'parsed' || stored === null) {
    throw badRequest('not_parsed');
  }

  const { result, applied } = applyCorrections(stored, ops);

  // The parse this correction is a verdict on: which model, which prompt, which databases
  // answered. Null when the entry predates traces or its trace has aged out — a label with
  // no provenance is still a label, which is why the column allows it.
  //
  // The newest trace AT OR BEFORE this revision, not one at exactly it. Only a parse writes
  // a trace, and a correction moves the revision without re-parsing — so the second
  // correction to a row sits a revision above the parse it is arguing with, and matching on
  // equality would quietly drop the provenance of every correction after the first.
  const trace = await db.query.parseTraces.findFirst({
    where: and(eq(parseTraces.entryId, id), lte(parseTraces.revision, revision)),
    orderBy: [desc(parseTraces.revision), desc(parseTraces.createdAt)],
  });

  const next = revision + 1;

  const updated = await db.transaction(async (tx) => {
    const rows = await tx
      .update(logEntries)
      .set({ result, kind: result.kind, revision: next, updatedAt: new Date() })
      .where(and(eq(logEntries.id, id), eq(logEntries.revision, revision)))
      .returning();

    // The row moved between the read above and this write. The ledger rows go back with it:
    // a correction recorded against a parse that no longer exists is a label for nothing.
    if (rows.length === 0) {
      throw conflict('revision_conflict');
    }

    await tx.insert(entryCorrections).values(
      applied.map((correction) => ({
        id: crypto.randomUUID(),
        entryId: id,
        userId: user.id,
        traceId: trace?.id ?? null,
        // The revision that was corrected, not the one this produced. The label describes
        // what the parser said, and the parser said it at `revision`.
        revision,
        itemIndex: correction.itemIndex,
        type: correction.type,
        before: correction.before,
        after: correction.after,
      })),
    );

    return rows[0]!;
  });

  // The same verdict, sent to the trace of the parse it is a verdict on. It is the second
  // reader of `entry_corrections` — the first is `npm run eval:harvest`, which turns these
  // into proposed gold cases weekly and by hand. This one is immediate, and it is what
  // makes the correction rate a number somebody can watch rather than one somebody has to
  // go and compute.
  //
  // Only when the parse is still known. A correction whose trace has aged out is still a
  // label, which is why the column is nullable — but there is nothing to attach it to.
  if (trace) {
    // Distinct items touched, not edits made: setting one item's food and then its portion
    // is one item the parse got wrong, not two. An added item is counted on both sides —
    // it is an item the parse should have produced and did not, so it belongs in the
    // denominator as much as the numerator.
    const addedItems = applied.filter((correction) => correction.type === 'add_item').length;
    const touchedItems = new Set(
      applied
        .filter((correction) => correction.itemIndex >= 0)
        .map((correction) => correction.itemIndex),
    ).size;

    recordCorrections({
      traceId: trace.id,
      expected: result,
      correctedItems: touchedItems + addedItems,
      totalItems: stored.items.length + addedItems,
      correctionTypes: [...new Set(applied.map((correction) => correction.type))],
    });
  }

  return toDto(updated);
}

export async function listEntries(userId: string, query: EntriesQuery): Promise<LogEntryDto[]> {
  const where =
    query.kind === 'day'
      ? and(eq(logEntries.userId, userId), eq(logEntries.day, query.day))
      : and(
          eq(logEntries.userId, userId),
          gte(logEntries.day, query.from),
          lte(logEntries.day, query.to),
        );

  const rows = await db.query.logEntries.findMany({
    where,
    orderBy: [asc(logEntries.createdAt)],
  });

  return rows.map(toDto);
}

export async function listLoggedDays(userId: string): Promise<number[]> {
  const rows = await db
    .selectDistinct({ day: logEntries.day })
    .from(logEntries)
    .where(eq(logEntries.userId, userId))
    .orderBy(asc(logEntries.day));

  return rows.map((row) => row.day);
}

/** Idempotent: deleting a row that is already gone is still a success. */
export async function deleteEntry(userId: string, id: string): Promise<void> {
  await db.delete(logEntries).where(and(eq(logEntries.id, id), eq(logEntries.userId, userId)));
}
