import { authClient } from './auth-client';

const baseURL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Above the API's own worst case — a parse may spend three 30 s passes on the model and
 * then the food databases — so this only fires when the server itself has stopped
 * answering. An `AbortController` rather than `AbortSignal.timeout`, which Hermes lacks.
 */
const REQUEST_TIMEOUT_MS = 100_000;

/**
 * Calls a protected endpoint with the session attached. React Native has no cookie jar,
 * so the cookie is set by hand and `credentials: 'omit'` stops a competing platform one.
 * Throws with the API's `error` field when the response is not ok.
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
    throw controller.signal.aborted ? new Error('Request timed out') : error;
  } finally {
    clearTimeout(timer);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}
