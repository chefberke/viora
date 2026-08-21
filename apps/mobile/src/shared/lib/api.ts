import { authClient } from './auth-client';

const baseURL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Above the API's own worst case — a parse may spend three 30 s passes on the model and
 * then the food databases — so this only fires when the server itself has stopped
 * answering. An `AbortController` rather than `AbortSignal.timeout`, which Hermes lacks.
 */
const REQUEST_TIMEOUT_MS = 100_000;

/**
 * A request the API refused, with the refusal intact.
 *
 * The status is the part callers cannot reconstruct. A stale composer edit and a stale
 * correction both come back as a conflict, and they mean opposite things: the edit may lose
 * quietly, because newer text supersedes older text, while the correction must not — "swap
 * item 2 for the third candidate" is a sentence about one specific list, and applying it to
 * a different list would silently change a food nobody looked at. Before this, both arrived
 * as an `Error` whose message happened to read `revision_conflict`.
 */
export class ApiError extends Error {
  readonly status: number;

  /**
   * The API's own `error` field, kept as a value rather than flattened into the message.
   *
   * The server has a real vocabulary — `llm_unavailable`, `llm_misconfigured`,
   * `request_timeout`, `invalid_json`, `revision_conflict` — and it was arriving as prose
   * that could only be matched by string comparison. Two of those codes share a status
   * (502) and mean different things to whoever is on call, and one of them (`request_timeout`)
   * changes what the *user* should do: the work may have landed anyway.
   *
   * Null when the body was not JSON or carried no `error`, which is what a proxy or a
   * gateway returns.
   */
  readonly code: string | null;

  /** From `Retry-After` on a 429, in seconds. The only failure that says when to come back. */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * The request was sent and nothing came back in time.
 *
 * Distinct from `NetworkError` because the two mean opposite things about the server: this
 * one reached it. A parse that timed out on the client may well have completed on the
 * server, so the honest advice is "check before you retry", not "try again".
 */
export class TimeoutError extends Error {
  constructor() {
    super('Request timed out');
    this.name = 'TimeoutError';
  }
}

/** The request never left, or the connection died. No server was reached. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** `Retry-After` in seconds, when the header is present and is a number we can use. */
function retryAfterOf(response: Response): number | null {
  const header = response.headers.get('retry-after');

  if (header === null) {
    return null;
  }

  const seconds = Number(header);

  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * Calls a protected endpoint with the session attached. React Native has no cookie jar,
 * so the cookie is set by hand and `credentials: 'omit'` stops a competing platform one.
 * Throws an `ApiError` carrying the status and the API's `error` field when the response
 * is not ok.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = await authClient.getCookie();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${baseURL}${path}`, {
      ...init,
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    // Both were untyped before: the timeout threw a bare `Error` whose message was the
    // only way to recognise it, and a dead connection rethrew whatever `fetch` raised —
    // which is why one caller had to compare against the literal string
    // 'Network request failed'. Neither could be told apart from a bug in a render.
    throw controller.signal.aborted ? new TimeoutError() : new NetworkError(error);
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const code =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : null;

    throw new ApiError(
      response.status,
      code ?? `Request failed with ${response.status}`,
      code,
      retryAfterOf(response),
    );
  }

  return body as T;
}
