/**
 * Everything the entries routes do once the request is known to be well formed: the
 * database reads and writes, the parse pipeline call, and the trace row that records it.
 */
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';

import { env } from '../../config/index.ts';
import { db } from '../../db/index.ts';
import { logEntries, parseTraces } from '../../db/app-schema.ts';
import type { SessionUser } from '../../lib/auth.ts';
import type { LogEntryDto } from '../../types/index.ts';
import { conflict, notFound } from '../../utils/index.ts';
import { isPipelineError, toHttpError, type PipelineError } from './entries.errors.ts';
import { parseRow } from './entries.pipeline.ts';
import { PROMPT_VERSION } from './entries.versions.ts';
import type { ParseOutcome } from './entries.types.ts';
import type { EntriesQuery } from './entries.validation.ts';

export interface UpsertEntryInput {
  id: string;
  user: SessionUser;
  requestId: string;
  rawText: string;
  day: number;
  revision: number;
}

function toDto(row: typeof logEntries.$inferSelect): LogEntryDto {
  return {
    id: row.id,
    day: row.day,
    rawText: row.rawText,
    revision: row.revision,
    status: row.status as LogEntryDto['status'],
    result: row.result ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Parses one composer row and stores it. Throws the HTTP error the client should see;
 * the trace row is written either way, so a failed parse is still measurable.
 */
export async function upsertEntry(input: UpsertEntryInput): Promise<LogEntryDto> {
  const { id, user, rawText, day, revision } = input;
  const existing = await db.query.logEntries.findFirst({ where: eq(logEntries.id, id) });

  // Someone else's id: pretend it does not exist rather than confirm it does.
  if (existing && existing.userId !== user.id) {
    throw notFound();
  }

  if (existing) {
    if (revision < existing.revision) {
      throw conflict('revision_conflict');
    }

    // Idempotent replay: the same edit again returns the stored parse for free.
    if (
      revision === existing.revision &&
      existing.rawText === rawText &&
      existing.status === 'parsed'
    ) {
      return toDto(existing);
    }
  }

  const startedAt = performance.now();
  let outcome: ParseOutcome | null = null;
  let pipelineError: PipelineError | null = null;

  try {
    outcome = await parseRow(rawText);
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
    .values({ id, userId: user.id, ...values })
    .onConflictDoUpdate({
      target: logEntries.id,
      set: values,
      setWhere: sql`${logEntries.revision} <= ${revision}`,
    });

  const stored = await db.query.logEntries.findFirst({ where: eq(logEntries.id, id) });

  if (!stored) {
    throw notFound();
  }

  await db.insert(parseTraces).values({
    id: crypto.randomUUID(),
    entryId: id,
    userId: user.id,
    requestId: input.requestId,
    revision,
    model: env.LLM_MODEL,
    promptVersion: PROMPT_VERSION,
    inputText: rawText,
    llmCacheHit: outcome?.trace.llmCacheHit ? 1 : 0,
    usdaLookups: outcome?.trace.usdaLookups ?? 0,
    usdaCacheHits: outcome?.trace.usdaCacheHits ?? 0,
    llmLatencyMs: outcome?.trace.llmLatencyMs ?? null,
    usdaLatencyMs: outcome?.trace.usdaLatencyMs ?? null,
    totalLatencyMs: outcome?.trace.totalLatencyMs ?? Math.round(performance.now() - startedAt),
    promptTokens: outcome?.trace.promptTokens ?? null,
    completionTokens: outcome?.trace.completionTokens ?? null,
    source: outcome?.trace.source ?? null,
    confidence: outcome?.trace.confidence ?? null,
    errorCode: pipelineError?.code ?? null,
  });

  if (pipelineError) {
    throw toHttpError(pipelineError);
  }

  return toDto(stored);
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
