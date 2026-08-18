import { authClient } from './auth-client';

const baseURL = process.env.EXPO_PUBLIC_API_URL;

/**
 * Calls a protected endpoint with the session attached. React Native has no cookie jar,
 * so the cookie is set by hand and `credentials: 'omit'` stops a competing platform one.
 * Throws with the API's `error` field when the response is not ok.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = await authClient.getCookie();

  const response = await fetch(`${baseURL}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  });

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
