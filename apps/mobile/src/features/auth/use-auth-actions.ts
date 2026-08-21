import { useCallback, useState } from 'react';

import { apiFetch, authClient, NetworkError } from '@/shared/lib';

/**
 * One readable line out of either failure shape: the `{ error }` Better Auth returns in
 * the response, or a real exception when the request never reached the server.
 *
 * The unreachable-server case used to be recognised by comparing the message against the
 * literal string 'Network request failed' — the platform's own wording, which is not ours
 * to depend on. `apiFetch` now throws a `NetworkError` for it, so the check is a type
 * check. The advice stays developer-facing on purpose: this is the sign-in screen, the one
 * place where the likeliest cause really is a misconfigured `EXPO_PUBLIC_API_URL`.
 */
function toMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Cannot reach the server. Check that the API is running and that EXPO_PUBLIC_API_URL points at it.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return 'Something went wrong. Please try again.';
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteAccountInput {
  /** One of the ids the API's `DELETION_REASONS` accepts. */
  reason: string;
}

/**
 * Every action resolves `true` on success. Most callers read `error` instead; the
 * settings sheet is what needs the value, to know when to leave the password form.
 */
export interface AuthActions {
  isPending: boolean;
  error: string | null;
  clearError: () => void;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (input: { email: string; password: string }) => Promise<boolean>;
  signUpWithEmail: (input: { name: string; email: string; password: string }) => Promise<boolean>;
  changePassword: (input: ChangePasswordInput) => Promise<boolean>;
  deleteAccount: (input: DeleteAccountInput) => Promise<boolean>;
  signOut: () => Promise<boolean>;
}

/**
 * Every call into the auth client, with the pending and error state they share. Nothing
 * here navigates: the session changes, the guard in `app/_layout.tsx` flips, and the
 * router moves on its own. A route push here would run a second transition over it.
 */
export function useAuthActions(): AuthActions {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<{ error?: unknown } | void>) => {
    setIsPending(true);
    setError(null);

    try {
      const result = await action();
      if (result && result.error) {
        setError(toMessage(result.error));
        return false;
      }
      return true;
    } catch (thrown) {
      setError(toMessage(thrown));
      return false;
    } finally {
      setIsPending(false);
    }
  }, []);

  const signInWithGoogle = useCallback(
    () =>
      run(() =>
        // The Expo plugin turns this path into a `viora://` deep link back into the app.
        authClient.signIn.social({ provider: 'google', callbackURL: '/' }),
      ),
    [run],
  );

  const signInWithEmail = useCallback(
    (input: { email: string; password: string }) =>
      run(() => authClient.signIn.email({ email: input.email.trim(), password: input.password })),
    [run],
  );

  const signUpWithEmail = useCallback(
    (input: { name: string; email: string; password: string }) =>
      run(() =>
        authClient.signUp.email({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
        }),
      ),
    [run],
  );

  const changePassword = useCallback(
    (input: ChangePasswordInput) =>
      run(() =>
        authClient.changePassword({
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          // A password change usually follows losing control of the account.
          revokeOtherSessions: true,
        }),
      ),
    [run],
  );

  const deleteAccount = useCallback(
    (input: DeleteAccountInput) =>
      run(async () => {
        // Stored first, and through our own API: `/delete-user` strips unknown body
        // fields, and this order keeps the answer if the deletion then fails.
        await apiFetch('/api/account/deletion-feedback', {
          method: 'POST',
          body: JSON.stringify(input),
        });

        // No password, so the server falls back to its freshness gate — which the API
        // turns off with `freshAge: 0`.
        return authClient.deleteUser({});
      }),
    [run],
  );

  const signOut = useCallback(() => run(() => authClient.signOut()), [run]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isPending,
    error,
    clearError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    changePassword,
    deleteAccount,
    signOut,
  };
}
