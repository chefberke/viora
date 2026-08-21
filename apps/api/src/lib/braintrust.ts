/**
 * Where a parse goes to be looked at afterwards.
 *
 * `parse_traces` records every run and always has. What it never had was a reader: the
 * numbers were on disk in a shape only SQL could ask questions of, and nobody was writing
 * the SQL. This module sends the same run to Braintrust as a trace — the meal line, the
 * messages the model was actually given, its raw answer, what each food database was asked
 * and answered, the tokens and what they cost — so the question "why did this line come
 * back wrong" has somewhere to be asked.
 *
 * Three rules hold this file together, and each of them is load-bearing:
 *
 * 1. **The logger is initialised from `src/index.ts` and nowhere else.** Not at module
 *    scope. `eval/run.ts` and `scripts/entries.check.ts` import the pipeline, which imports
 *    this file, and both of them run with the developer's own `.env` loaded. If a logger
 *    appeared on import, one replay of the gold set would post 126 fabricated parses into
 *    the project that production traces live in. Explicit init at boot makes "the eval never
 *    reaches Braintrust" a fact about the code rather than a promise about the flags.
 * 2. **Nothing here may fail a parse.** Every helper runs its callback whether or not the
 *    span could be opened, and swallows its own failures into a log line. Tracing is the
 *    thing that watches the pipeline; it does not get to take it down.
 * 3. **Nothing here may slow a parse.** `span.log()` and `span.end()` write to an in-memory
 *    batch that a background flusher drains, so no helper below awaits the network. The one
 *    place that does is `flushBraintrust()`, on shutdown, where waiting is the point.
 */
import { createHash } from 'node:crypto';

import { initLogger, traced, type Logger, type Span } from 'braintrust';

import { env } from '../config/index.ts';
import { log, logError } from '../utils/index.ts';
import type { ParseOutcome, ProviderTrace } from '../modules/entries/entries.types.ts';

/**
 * The live logger, or null when tracing is off — which is the default, and the state every
 * gate in this repo runs in. `initBraintrust()` is the only thing that may set it.
 */
let logger: Logger<true> | null = null;

/** One line per outage, not one per dropped batch. The same latch `lib/redis.ts` keeps. */
let degraded = false;

function noteFlushFailure(error: unknown): void {
  if (!degraded) {
    degraded = true;
    logError('braintrust_degraded', error);
  }
}

/**
 * Starts tracing, once, at server boot.
 *
 * Safe to call with no key: it says so and leaves every helper below a pass-through. Safe to
 * call twice, though nothing does — the guard is there because the cost of a second logger
 * is two copies of every span, which is the kind of bug that is only visible in the bill.
 */
export function initBraintrust(): void {
  if (logger !== null) {
    return;
  }

  if (!env.hasBraintrust) {
    log('braintrust_disabled');

    return;
  }

  try {
    logger = initLogger({
      apiKey: env.BRAINTRUST_API_KEY,
      // An id when there is one, a name when there is not. Never neither: a logger with no
      // project writes to the organisation's Global project, where these traces would sit
      // among everything else the organisation does and be findable by nobody.
      ...(env.BRAINTRUST_PROJECT_ID
        ? { projectId: env.BRAINTRUST_PROJECT_ID }
        : { projectName: 'viora' }),

      // The default, stated. Spans batch in memory and a background task ships them, which
      // is the only reason a helper below can be called from the request path at all.
      asyncFlush: true,

      // The SDK is otherwise silent about a batch it could not deliver. Silence is the wrong
      // answer for the component whose entire job is to notice things.
      onFlushError: noteFlushFailure,
    });

    log('braintrust_ready', {
      project: env.BRAINTRUST_PROJECT_ID || 'viora',
      logsInput: env.BRAINTRUST_LOG_INPUT,
    });
  } catch (error) {
    logger = null;
    logError('braintrust_init_failed', error);
  }
}

/**
 * A stable, non-reversible stand-in for a user id.
 *
 * Braintrust needs to tell two people's parses apart — "this account corrects everything"
 * is a real question — and needs nothing else about them. The salt is the auth secret,
 * which means the mapping cannot be rebuilt from anything in this repository and no new
 * secret has to be managed to keep it that way. Sixteen hex characters is 64 bits, far past
 * collision range for a user table, and short enough to read in a filter box.
 */
export function hashUserId(userId: string): string {
  return createHash('sha256')
    .update(`${env.BETTER_AUTH_SECRET}:${userId}`)
    .digest('hex')
    .slice(0, 16);
}

/** What a trace needs to know about the request that caused it. */
export interface ParseSpanContext {
  /** `parse_traces.id`. It is also the Braintrust row id — see `entries.trace.ts`. */
  traceId: string;
  entryId: string;
  userId: string;
  requestId: string;
  revision: number;
  inputText: string;
}

/**
 * The root span of a parse: one trace, whatever happens inside it.
 *
 * The span opens before the pipeline runs and closes after it, including when it throws —
 * a parse that failed is the most interesting kind to look at, and a tracer that only
 * records successes is a tracer that hides exactly what you came for.
 *
 * The children (`llm`, `usda`, `off`) attach themselves. Braintrust tracks the current span
 * in `AsyncLocalStorage`, so a span opened anywhere inside this callback lands underneath
 * it without a span object being threaded through `ParseDeps` — which matters, because that
 * interface is the seam the eval and `entries.check.ts` inject stubs through, and widening
 * it for tracing would have put tracing into both of them.
 */
export async function tracedParse(
  ctx: ParseSpanContext,
  run: () => Promise<ParseOutcome>,
): Promise<ParseOutcome> {
  const active = logger;

  if (active === null) {
    return run();
  }

  /**
   * The failure, caught inside the span and rethrown outside it.
   *
   * `traced()` catches whatever the callback throws and writes it to the span's `error`
   * field itself — last, after anything the callback logged. The pipeline throws plain
   * tagged objects rather than `Error`s, and the SDK's rendering of one of those is the
   * literal string "[object Object]", which would overwrite the taxonomy code with noise.
   * So the throw does not pass through the span at all.
   */
  let failure: unknown = null;

  const outcome = await active.traced(
    async (span) => {
      try {
        span.log({
          input: env.BRAINTRUST_LOG_INPUT ? ctx.inputText : '[redacted]',
          metadata: {
            user: hashUserId(ctx.userId),
            entry_id: ctx.entryId,
            request_id: ctx.requestId,
            revision: ctx.revision,
          },
        });
      } catch (error) {
        noteFlushFailure(error);
      }

      try {
        const parsed = await run();

        describeOutcome(span, parsed);

        return parsed;
      } catch (error) {
        describeFailure(span, error);
        failure = error;

        return null;
      }
    },
    {
      name: 'parse',
      type: 'task',
      // The row id, so `parse_traces.id` and this trace are one object under one uuid. It
      // is what lets a correction, which only ever knew the Postgres id, come back later
      // and attach itself to the right trace.
      event: { id: ctx.traceId },
    },
  );

  if (failure !== null) {
    throw failure;
  }

  return outcome!;
}

/** Everything the pipeline learned, written onto the root span once it is known. */
function describeOutcome(span: Span, outcome: ParseOutcome): void {
  try {
    const { result, trace } = outcome;
    const grounded = result.items.filter((item) => item.source !== 'llm_estimate').length;
    const tags = ['parsed'];

    if (trace.llmCacheHit) {
      tags.push('cached');
    }

    for (const provider of trace.providers) {
      if (provider.unreachable > 0) {
        tags.push(`degraded:${provider.provider}`);
      }
    }

    span.log({
      output: result,
      tags,
      metadata: {
        model: trace.model,
        prompt_version: trace.promptVersion,
        source: trace.source,
        kind: result.kind,
        confidence_level: result.confidenceLevel,
        llm_cache_hit: trace.llmCacheHit,
        error_code: null,
        needs_review_count: result.items.filter((item) => item.needsReview).length,
      },
      metrics: {
        total_latency_ms: trace.totalLatencyMs,
        ...(trace.llmLatencyMs === null ? {} : { llm_latency_ms: trace.llmLatencyMs }),
        item_count: result.items.length,
        grounded_items: grounded,
        confidence: trace.confidence ?? 0,
      },
    });
  } catch (error) {
    noteFlushFailure(error);
  }
}

/**
 * A parse that threw. The pipeline's own taxonomy code is the useful part — `error` alone
 * would put four different failures under one heading.
 */
function describeFailure(span: Span, error: unknown): void {
  try {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'unexpected_error';

    span.log({
      // Stated rather than left to `traced()`, which stringifies whatever was thrown. The
      // pipeline throws plain tagged objects, not `Error`s, and the default rendering of
      // one is the literal text "[object Object]".
      error: code,
      tags: ['failed', `error:${code}`],
      metadata: { error_code: code, model: env.LLM_MODEL },
    });
  } catch (nested) {
    noteFlushFailure(nested);
  }
}

/** What one call to the model was given, and what came back. */
export interface LlmSpanResult {
  messages: unknown;
  raw: string;
  promptTokens: number | null;
  completionTokens: number | null;
  /** How many passes it took, including the one that succeeded. */
  attempts: number;
  /** The last non-ok status seen, or 0 if none. Says why there was more than one attempt. */
  lastStatus: number;
  /** `response_format` had to be dropped for the model to answer at all. */
  jsonFormatDropped: boolean;
  /** The answer came out of a rejection body rather than a successful response. */
  salvaged: boolean;
}

/**
 * The model call, as its own span.
 *
 * This is the one Braintrust renders as a conversation: `input` is the message array that
 * actually went over the wire, few-shots included, and `output` is the raw generation
 * before `validateLlmOutput` has an opinion about it. Seeing those two side by side is most
 * of the reason to have any of this.
 *
 * `describe` is a callback rather than a return value because the interesting fields — how
 * many attempts, which status, whether the answer was salvaged — are only known once the
 * retry loop has finished, and some of them are known on the failing path too.
 */
export async function tracedLlmCall<T>(
  run: (describe: (result: LlmSpanResult) => void) => Promise<T>,
): Promise<T> {
  if (logger === null) {
    return run(() => {});
  }

  return traced(
    async (span) => {
      const describe = (result: LlmSpanResult): void => {
        try {
          span.log({
            input: result.messages,
            output: result.raw,
            metadata: {
              model: env.LLM_MODEL,
              attempts: result.attempts,
              last_status: result.lastStatus,
              json_format_dropped: result.jsonFormatDropped,
              salvaged: result.salvaged,
            },
            metrics: tokenMetrics(result.promptTokens, result.completionTokens),
          });
        } catch (error) {
          noteFlushFailure(error);
        }
      };

      return run(describe);
    },
    { name: 'llm', type: 'llm' },
  );
}

/**
 * Tokens, and what they cost.
 *
 * Braintrust prices the models it knows; this pipeline runs `openai/gpt-oss-120b` behind an
 * OpenAI-shaped endpoint and is not one of them, so the money is computed here from
 * `LLM_PRICE_*_PER_1K`. Two absences are deliberate:
 *
 * - With no price configured there is no `cost_usd` key at all. A confident `$0.00` beside
 *   a real call is worse than no figure, because it aggregates.
 * - With no token counts — the salvaged generation and the JSON-mode retry both return
 *   null on purpose, see `entries.llm.ts` — there is no cost either, for the same reason
 *   that function refuses to invent the counts.
 */
function tokenMetrics(
  promptTokens: number | null,
  completionTokens: number | null,
): Record<string, number> {
  if (promptTokens === null && completionTokens === null) {
    return {};
  }

  const prompt = promptTokens ?? 0;
  const completion = completionTokens ?? 0;
  const metrics: Record<string, number> = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    tokens: prompt + completion,
  };

  const priced = env.LLM_PRICE_PROMPT_PER_1K > 0 || env.LLM_PRICE_COMPLETION_PER_1K > 0;

  if (priced) {
    metrics.cost_usd =
      (prompt / 1000) * env.LLM_PRICE_PROMPT_PER_1K +
      (completion / 1000) * env.LLM_PRICE_COMPLETION_PER_1K;
  }

  return metrics;
}

/**
 * One food database's wave, as a span.
 *
 * The counters are `ProviderTrace` verbatim, which is the same record `parse_trace_lookups`
 * gets. `unreachable` is the one worth a filter: a database that is answering nothing
 * degrades every item on the line to a flagged estimate, and the parse still succeeds, so
 * without this the only symptom is accuracy drifting down over weeks with nothing to point
 * at. It is a count and not a boolean because USDA can be down while Open Food Facts is fine.
 */
export function tracedLookups<T>(
  provider: string,
  queries: readonly string[],
  run: () => Promise<T>,
  describe: (value: T) => ProviderTrace | null,
): Promise<T> {
  if (logger === null) {
    return run();
  }

  return traced(
    async (span) => {
      const value = await run();

      try {
        const trace = describe(value);

        if (trace !== null) {
          span.log({
            input: queries,
            metadata: { provider: trace.provider },
            metrics: {
              lookups: trace.lookups,
              cache_hits: trace.cacheHits,
              skipped: trace.skipped,
              unreachable: trace.unreachable,
              ...(trace.latencyMs === null ? {} : { latency_ms: trace.latencyMs }),
            },
            ...(trace.unreachable > 0 ? { tags: [`degraded:${trace.provider}`] } : {}),
          });
        }
      } catch (error) {
        noteFlushFailure(error);
      }

      return value;
    },
    { name: provider, type: 'tool' },
  );
}

/** A person's verdict on a parse, attached to the trace it is a verdict on. */
export interface CorrectionFeedback {
  /** `parse_traces.id` of the parse being corrected, which is also its Braintrust row id. */
  traceId: string;
  /** The result as the person left it: what the parse should have returned. */
  expected: unknown;
  /** How many of the parse's items they touched, and how many there were. */
  correctedItems: number;
  totalItems: number;
  /** Becomes one `correction:<type>` tag each, so the ledger's vocabulary is filterable. */
  correctionTypes: readonly string[];
}

/**
 * The other half of the loop.
 *
 * A correction is the only ground truth this system ever gets for free, and until now it
 * lived in `entry_corrections` where the harvest reads it into proposed gold cases — good,
 * but weekly and by hand. Sent here it also lands on the trace of the parse that got it
 * wrong, so the run and the verdict on the run are one object.
 *
 * `items_accepted` is the share of the parse the person left alone. A parse nobody touched
 * has no feedback at all and does not drag the average down; a parse where two of three
 * items were swapped scores 0.33. That average, over the parse spans it hangs from, is the
 * correction rate.
 *
 * Fire-and-forget by design: the correction is already committed by the time this runs, and
 * a scoring call that could fail the request would make the ledger worse, not better.
 */
export function recordCorrections(feedback: CorrectionFeedback): void {
  if (logger === null) {
    return;
  }

  try {
    const { correctedItems, totalItems } = feedback;
    const accepted = totalItems > 0 ? Math.max(0, 1 - correctedItems / totalItems) : 0;

    logger.logFeedback({
      id: feedback.traceId,
      scores: { items_accepted: accepted },
      expected: feedback.expected,
      // Tags, not metadata. `logFeedback` files its `metadata` as AUDIT metadata — a note
      // about who gave the verdict rather than a field on the row — so a correction type
      // sent that way is recorded and unfilterable. Tags merge onto the trace itself and
      // are what "show me every parse whose portion had to be fixed" actually reads.
      tags: ['corrected', ...feedback.correctionTypes.map((type) => `correction:${type}`)],
      metadata: {
        corrected_items: correctedItems,
        total_items: totalItems,
      },
    });
  } catch (error) {
    noteFlushFailure(error);
  }
}

/**
 * Log events that are not requests, mirrored as spans.
 *
 * `redis_degraded`, `circuit_open`, `usda_unavailable`, `rate_limited`, `request_timeout` —
 * the whole latched vocabulary in `utils/logger.ts` — used to exist only as JSON lines on
 * stdout, which is a fine place to keep them and a poor place to count them. Mirrored here
 * they sit on the same timeline as the parses they explain, which is the only way "latency
 * doubled at 14:20" and "the cache went down at 14:19" are ever seen as one event.
 *
 * Not from `utils/logger.ts` directly: that file has no dependencies and is imported by
 * everything, this one imports the SDK and the config. `index.ts` wires them together.
 */
export function mirrorEvent(event: string, fields: Record<string, unknown>): void {
  if (logger === null) {
    return;
  }

  try {
    // A span rather than `logger.log`, only so the row carries the event as its NAME. A
    // bare log row is called `root` in every list it appears in, which makes the one view
    // these exist for — the timeline, next to the parses they explain — unreadable.
    const span = logger.startSpan({ name: event, type: 'function' });

    span.log({ input: event, output: fields, tags: ['ops', event], metadata: { event, ...fields } });
    span.end();
  } catch {
    // Not `noteFlushFailure`: this is the path that reports failures, and a failure to
    // report one must not become a second one to report.
    degraded = true;
  }
}

/**
 * Ship whatever is still batched.
 *
 * The SDK flushes on `beforeExit`, which SIGTERM does not trigger — so without this a
 * deploy silently drops every span since the last background flush, and the traces missing
 * from Braintrust would be exactly the ones from the minutes before a restart.
 */
export async function flushBraintrust(): Promise<void> {
  if (logger === null) {
    return;
  }

  try {
    await logger.flush();

    if (degraded) {
      degraded = false;
      log('braintrust_recovered');
    }
  } catch (error) {
    logError('braintrust_flush_failed', error);
  }
}
