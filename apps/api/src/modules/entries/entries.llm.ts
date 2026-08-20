/** Transport for the parse call: one OpenAI-shaped request, its retries, nothing else. */
import { env } from '../../config/index.ts';
import { pipelineError } from './entries.errors.ts';
import { FEW_SHOTS, SYSTEM_PROMPT } from './entries.prompt.ts';
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
const RETRY_DELAY_MS = 500;

interface ChatCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestCompletion(rawText: string, useJsonFormat: boolean): Promise<Response> {
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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...FEW_SHOTS.flatMap((shot) => [
          { role: 'user', content: shot.user },
          { role: 'assistant', content: shot.assistant },
        ]),
        { role: 'user', content: rawText },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** One transparent retry on transient failures; a hard failure carries its taxonomy code. */
export async function callParseLlm(rawText: string): Promise<LlmCallResult> {
  let useJsonFormat = true;
  let lastStatus = 0;

  // Up to 3 passes: the extra one covers dropping response_format for models
  // that reject it, so a transient failure still gets its retry afterwards.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;

    try {
      response = await requestCompletion(rawText, useJsonFormat);
    } catch {
      lastStatus = 0;
      await delay(RETRY_DELAY_MS);
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
        await delay(RETRY_DELAY_MS);
        continue;
      }

      const content = body.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content === '') {
        throw pipelineError('llm_invalid_output');
      }

      const promptTokens = body.usage?.prompt_tokens;
      const completionTokens = body.usage?.completion_tokens;

      return {
        raw: content,
        promptTokens: typeof promptTokens === 'number' ? promptTokens : null,
        completionTokens: typeof completionTokens === 'number' ? completionTokens : null,
      };
    }

    lastStatus = response.status;

    // Some models reject response_format; the prompt already demands JSON, so drop it once.
    if (response.status === 400 && useJsonFormat) {
      const text = await response.text().catch(() => '');

      if (text.includes('response_format')) {
        useJsonFormat = false;
        continue;
      }

      throw pipelineError('llm_unavailable');
    }

    if (response.status === 429 || response.status >= 500) {
      await delay(RETRY_DELAY_MS);
      continue;
    }

    throw pipelineError('llm_unavailable');
  }

  throw pipelineError(lastStatus === 429 ? 'rate_limited' : 'llm_unavailable');
}
