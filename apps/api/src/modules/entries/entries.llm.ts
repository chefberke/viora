/** Transport for the parse call: one OpenAI-shaped request, its retries, nothing else. */
import { env } from '../../config/index.ts';
import { tracedLlmCall, type LlmSpanResult } from '../../lib/braintrust.ts';
import { createCircuitBreaker, log, logError } from '../../utils/index.ts';
import { pipelineError } from './entries.errors.ts';
import { FEW_SHOTS, SYSTEM_PROMPT, wrapDiaryLine } from './entries.prompt.ts';
import type { LlmCallResult } from './entries.types.ts';

const CHAT_COMPLETIONS_PATH = '/chat/completions';
/**
 * Covers the whole call, headers and body together. A queued model answers its headers in
 * under a second and then pads the connection with whitespace while it works, so this
 * budget is really the body read. Measured on the free tier: about 11 s for a good answer,
 * and 20 s was tight enough to abort answers that were still on their way.
 *
 * Three passes at this length is the worst case a failing parse can cost a request.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Retry pacing. The old flat 500 ms is the base; each further attempt doubles it, and the
 * whole wait is multiplied by a random factor rather than added to one.
 *
 * Full jitter, not a fixed delay plus noise: when a provider comes back from a wobble
 * every request that was waiting on it retries, and a fixed delay makes them all retry in
 * the same millisecond. Spreading them across the window is the difference between a
 * recovery and a second outage of our own making.
 */
const RETRY_BASE_MS = 500;
const RETRY_MAX_MS = 4_000;

/**
 * The ceiling on one parse's transport, across every attempt and every wait.
 *
 * Three passes of a 30 s request plus their delays is a worst case around 91 s — long
 * enough that the phone has given up and the person has retried into a second parse
 * nobody is waiting for. This is what actually bounds it: backoff on its own makes the
 * worst case longer, not shorter.
 */
const TOTAL_BUDGET_MS = 45_000;

/**
 * Stops calling a provider that is not answering.
 *
 * What counts as a failure here is narrow on purpose. A 429 does NOT: that is the provider
 * working correctly and metering us, it already has its own code, and the recorder in
 * `eval/cassette.ts` deliberately waits a 429 out for a full minute — a breaker that
 * tripped on those would hand it an instant `llm_unavailable` after its patient wait and
 * abort a record run. `llm_invalid_output` does not count either: that is the model
 * answering, badly. Only transport failures and 5xx do, plus a misconfiguration, which
 * trips it outright because it cannot be transient.
 */
const breaker = createCircuitBreaker('llm', { failures: 4, openMs: 30_000 });

interface ChatCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Full jitter: anywhere from no wait at all to the whole doubled window. */
function backoffMs(attempt: number): number {
  return Math.random() * Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
}

/**
 * A status that means the request was wrong rather than the provider unwell. 404 is in
 * here because that is how a model id that does not exist usually arrives; an unknown 400
 * is not, because a rejected parameter arrives the same way and that path is already
 * handled below.
 */
function isMisconfiguration(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

/**
 * Exactly what the model is shown, built once per parse.
 *
 * It is separate from the request so the trace can log the messages that actually went over
 * the wire rather than a reconstruction of them. A prompt you have to rebuild to inspect is
 * a prompt you will eventually inspect wrongly.
 */
function buildMessages(rawText: string): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    // Wrapped here, and wrapped identically for the examples: the model must never
    // see a demonstration that arrived in a different shape from the real question.
    ...FEW_SHOTS.flatMap((shot) => [
      { role: 'user', content: wrapDiaryLine(shot.user) },
      { role: 'assistant', content: shot.assistant },
    ]),
    { role: 'user', content: wrapDiaryLine(rawText) },
  ];
}

function requestCompletion(
  messages: ReturnType<typeof buildMessages>,
  useJsonFormat: boolean,
): Promise<Response> {
  return fetch(`${env.LLM_BASE_URL}${CHAT_COMPLETIONS_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.LLM_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      temperature: 0,
      ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
      messages,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * The model's own words, salvaged from a JSON-mode rejection.
 *
 * When a provider validates JSON server-side it has already run the model, already
 * charged for the tokens, and already holds the text — Groq returns it as
 * `failed_generation` beside a `json_validate_failed` code. Asking again would buy a
 * second copy of an answer we were handed for free, and buy it at the worst moment: the
 * per-minute token budget is exactly what a doubled call spends. So the text is taken as
 * the answer it is. Whether it parses is not this function's business —
 * `validateLlmOutput` decides that, and a refusal correctly becomes
 * `llm_invalid_output` rather than a fabricated outage.
 *
 * Token counts are dropped: the error body carries no usage, and inventing one would
 * corrupt the cost figures the eval reports.
 */
function salvageFailedGeneration(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { failed_generation?: unknown } };
    const generation = parsed.error?.failed_generation;

    return typeof generation === 'string' && generation !== '' ? generation : null;
  } catch {
    return null;
  }
}

/**
 * The provider's own answer to "when should I come back", in milliseconds, when it gave
 * one and it fits inside what we are willing to wait.
 *
 * Honouring it beats guessing: a 429 with `retry-after: 12` means the token bucket refills
 * in twelve seconds, and any backoff we invent is either wasteful or too early. Anything
 * longer than the retry ceiling is ignored, because at that point not retrying at all is
 * the better answer and the budget check will say so.
 */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('retry-after');

  if (header === null) {
    return null;
  }

  const seconds = Number(header);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  const ms = seconds * 1000;

  return ms <= RETRY_MAX_MS * 4 ? ms : null;
}

/**
 * Which 400s are worth one more pass with `response_format` dropped.
 *
 * Two different failures arrive as a 400, and the same retry answers both. A provider that
 * does not support the parameter says so by name. A provider that supports it but could not
 * make this particular generation parse says something narrower — Groq answers
 * `json_validate_failed` and puts the offending text in `failed_generation` — and that is
 * the model declining or rambling, not the provider being down.
 *
 * Neither is an outage, and the prompt demands JSON on its own, so the second pass costs
 * one call and tells the two apart. What comes back is either a real parse or a string
 * `validateLlmOutput` rejects as `llm_invalid_output`, which is the honest code. Without
 * this, a model that simply refused a line was reported to the user as a dead provider.
 */
function retryWithoutJsonFormat(body: string): boolean {
  return body.includes('response_format') || body.includes('json_validate_failed');
}

/**
 * One parse call, with its retries, its budget and its breaker.
 *
 * Three things bound it, and they bound different failures. The per-request timeout stops
 * one call hanging. `TOTAL_BUDGET_MS` stops the retries adding up to longer than anyone is
 * waiting. The breaker stops a provider that is already known to be down from being asked
 * again at all — the case where the previous two do their job perfectly and the request
 * still pays for the whole ladder to learn nothing new.
 */
export function callParseLlm(rawText: string): Promise<LlmCallResult> {
  return tracedLlmCall((describe) => requestParse(rawText, describe));
}

/**
 * The call itself. Split from `callParseLlm` only so the span can wrap it: `describe` is
 * how the loop below hands the trace the things that are not knowable until it has
 * finished — how many passes it took, which status ended it, whether the answer came out
 * of a rejection body. Every one of those is a fact about a failure, so it is reported on
 * the throwing paths too, not just the returning one.
 */
async function requestParse(
  rawText: string,
  describe: (result: LlmSpanResult) => void,
): Promise<LlmCallResult> {
  const messages = buildMessages(rawText);

  if (!breaker.allow()) {
    describe({
      messages,
      raw: '',
      promptTokens: null,
      completionTokens: null,
      attempts: 0,
      lastStatus: 0,
      jsonFormatDropped: false,
      salvaged: false,
    });

    throw pipelineError('llm_unavailable');
  }

  const startedAt = Date.now();
  let useJsonFormat = true;
  let lastStatus = 0;
  let attempts = 0;
  let reported = false;

  /**
   * Reports once, whatever happens. Two of the paths out of the loop throw from inside a
   * branch that has already learned everything worth recording, and a second report would
   * overwrite the first with a blanker one.
   */
  function report(
    raw: string,
    promptTokens: number | null,
    completionTokens: number | null,
    salvaged: boolean,
  ): void {
    if (reported) {
      return;
    }

    reported = true;
    describe({
      messages,
      raw,
      promptTokens,
      completionTokens,
      attempts,
      lastStatus,
      jsonFormatDropped: !useJsonFormat,
      salvaged,
    });
  }

  /** True while there is enough of the budget left for another attempt to be worth it. */
  function hasBudget(waitMs: number): boolean {
    return Date.now() - startedAt + waitMs + REQUEST_TIMEOUT_MS <= TOTAL_BUDGET_MS;
  }

  // Up to 3 passes: the extra one covers dropping response_format for models
  // that reject it, so a transient failure still gets its retry afterwards.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;

    attempts += 1;

    try {
      response = await requestCompletion(messages, useJsonFormat);
    } catch (error) {
      lastStatus = 0;
      breaker.recordFailure(error);

      const wait = backoffMs(attempt);

      if (!hasBudget(wait)) {
        break;
      }

      await delay(wait);
      continue;
    }

    if (response.ok) {
      const body = (await response.json().catch(() => null)) as ChatCompletion | null;

      // The headers arrive long before the body does: a queued model holds the connection
      // open and pads it with whitespace, so the request timeout lands on the READ. That
      // is a transport failure and takes the retry, not `llm_invalid_output` — the code
      // for a model that answered with rubbish, which throws on the spot and never retries.
      if (body === null) {
        lastStatus = 0;
        breaker.recordFailure();

        const wait = backoffMs(attempt);

        if (!hasBudget(wait)) {
          break;
        }

        await delay(wait);
        continue;
      }

      const content = body.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content === '') {
        // The provider is healthy — it answered. The model is not, and that has its own
        // code, so this closes the breaker rather than counting against it.
        breaker.recordSuccess();
        report('', null, null, false);

        throw pipelineError('llm_invalid_output');
      }

      breaker.recordSuccess();

      const promptTokens = body.usage?.prompt_tokens;
      const completionTokens = body.usage?.completion_tokens;

      const result: LlmCallResult = {
        raw: content,
        promptTokens: typeof promptTokens === 'number' ? promptTokens : null,
        completionTokens: typeof completionTokens === 'number' ? completionTokens : null,
      };

      report(result.raw, result.promptTokens, result.completionTokens, false);

      return result;
    }

    lastStatus = response.status;

    // A key that was revoked, a plan that does not cover the model, a model id that does
    // not exist. None of them heal on their own, so this neither retries nor waits: it
    // opens the breaker so the next request does not repeat the discovery, and it says in
    // the log what is actually wrong. Before this the same statuses became a 502 and read
    // in the traces as an upstream outage.
    if (isMisconfiguration(response.status)) {
      logError('llm_misconfigured', new Error(`llm answered ${response.status}`), {
        status: response.status,
        model: env.LLM_MODEL,
      });
      breaker.trip();
      report('', null, null, false);

      throw pipelineError('llm_misconfigured');
    }

    // A rejected parameter or an unparseable generation: drop response_format and retry once.
    if (response.status === 400 && useJsonFormat) {
      const text = await response.text().catch(() => '');
      const salvaged = salvageFailedGeneration(text);

      // Already generated and already paid for: take it rather than buy it twice.
      if (salvaged !== null) {
        breaker.recordSuccess();
        report(salvaged, null, null, true);

        return { raw: salvaged, promptTokens: null, completionTokens: null };
      }

      if (retryWithoutJsonFormat(text)) {
        useJsonFormat = false;
        continue;
      }

      report('', null, null, false);

      throw pipelineError('llm_unavailable');
    }

    if (response.status === 429 || response.status >= 500) {
      // Only the 5xx counts. A 429 is the provider metering us correctly — see the note
      // on `breaker`.
      if (response.status >= 500) {
        breaker.recordFailure(new Error(`llm answered ${response.status}`));
      }

      const wait = retryAfterMs(response) ?? backoffMs(attempt);

      if (!hasBudget(wait)) {
        break;
      }

      await delay(wait);
      continue;
    }

    report('', null, null, false);

    throw pipelineError('llm_unavailable');
  }

  report('', null, null, false);

  if (lastStatus === 429) {
    throw pipelineError('rate_limited');
  }

  log('llm_gave_up', { lastStatus, elapsedMs: Date.now() - startedAt });

  throw pipelineError('llm_unavailable');
}
