/**
 * The `parse_traces` row every parse leaves behind, and its per-provider companions.
 *
 * It lives on its own because there is more than one way into the pipeline. Entries were
 * the first, saved meals were the second, and for a while only the first was measured —
 * so the numbers on the traces table described a subset of the parses that had actually
 * run, and nothing said which subset. A parse that writes no trace is a parse that never
 * happened as far as every later measurement is concerned.
 */
import { env } from '../../config/index.ts';
import { db } from '../../db/index.ts';
import { parseTraceLookups, parseTraces } from '../../db/app-schema.ts';
import type { ParseOutcome } from './entries.types.ts';
import { PROMPT_VERSION } from './entries.versions.ts';

export interface ParseTraceInput {
  /**
   * The id this run is recorded under, minted by the caller before the parse rather than
   * here after it.
   *
   * It moved out of this function so that one uuid can name the run in two places at once:
   * this row, and the Braintrust trace opened around the same parse. A correction only ever
   * knew the Postgres id — `entry_corrections.trace_id` — and that is now enough to find the
   * trace too, without a second identifier to store and keep in step.
   */
  traceId: string;
  /**
   * The row this parse belongs to. `parse_traces` has no foreign key on it, on purpose:
   * a saved meal is not a log entry and writes `saved:<id>`, which keeps the two id spaces
   * apart and readable at a glance.
   */
  entryId: string;
  userId: string;
  requestId: string;
  revision: number;
  inputText: string;
  /** Null when the pipeline threw: the run is still recorded, with its error code. */
  outcome: ParseOutcome | null;
  errorCode: string | null;
  /** `performance.now()` from before the parse, for the one case where the outcome has none. */
  startedAt: number;
}

/** Writes the trace and returns its id, so a correction can be joined back to the parse. */
export async function writeParseTrace(input: ParseTraceInput): Promise<string> {
  const { outcome, traceId } = input;

  // The trace and its per-database rows are one record: a trace with no lookup rows
  // would read as "no database was reached", which is reserved for a run that failed.
  await db.transaction(async (tx) => {
    await tx.insert(parseTraces).values({
      id: traceId,
      entryId: input.entryId,
      userId: input.userId,
      requestId: input.requestId,
      revision: input.revision,
      model: env.LLM_MODEL,
      promptVersion: PROMPT_VERSION,
      inputText: input.inputText,
      llmCacheHit: outcome?.trace.llmCacheHit ? 1 : 0,
      llmLatencyMs: outcome?.trace.llmLatencyMs ?? null,
      totalLatencyMs:
        outcome?.trace.totalLatencyMs ?? Math.round(performance.now() - input.startedAt),
      promptTokens: outcome?.trace.promptTokens ?? null,
      completionTokens: outcome?.trace.completionTokens ?? null,
      source: outcome?.trace.source ?? null,
      confidence: outcome?.trace.confidence ?? null,
      errorCode: input.errorCode,
    });

    // One row per food database the parse ran a wave for. A failed run leaves none.
    if (outcome && outcome.trace.providers.length > 0) {
      await tx.insert(parseTraceLookups).values(
        outcome.trace.providers.map((provider) => ({
          traceId,
          provider: provider.provider,
          lookups: provider.lookups,
          cacheHits: provider.cacheHits,
          skipped: provider.skipped,
          unreachable: provider.unreachable,
          latencyMs: provider.latencyMs,
        })),
      );
    }
  });

  return traceId;
}

/** A fresh id for a run about to happen. See `ParseTraceInput.traceId` for why it is here. */
export function newTraceId(): string {
  return crypto.randomUUID();
}

/** The prefix a saved-meal parse is traced under. See `ParseTraceInput.entryId`. */
export function savedMealTraceId(savedMealId: string): string {
  return `saved:${savedMealId}`;
}
