import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

// Inlined at bundle time, so Metro must restart after a `.env` change.
const baseURL = process.env.EXPO_PUBLIC_API_URL;

if (!baseURL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Copy apps/mobile/.env.example to apps/mobile/.env, ' +
      'then restart Metro.',
  );
}

/**
 * `expoClient` makes Better Auth work outside a browser: the session cookie goes to
 * SecureStore and OAuth callbacks become `viora://` deep links. It pairs with the `expo()`
 * plugin in the API. The cached session is why `useSession()` resolves without a request.
 */
export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      // Must match `scheme` in app.json, and the trustedOrigins list on the server.
      scheme: 'viora',
      storagePrefix: 'viora',
      storage: SecureStore,
    }),
  ],
});
