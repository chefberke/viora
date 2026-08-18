import { useEffect, useState } from 'react';

import { authClient } from '@/shared/lib';

/** Better Auth's id for an email and password account. Social accounts carry the provider. */
const CREDENTIAL_PROVIDER = 'credential';

/** How each provider is named to the user. Anything unlisted is shown as it comes. */
const PROVIDER_LABELS: Record<string, string> = {
  [CREDENTIAL_PROVIDER]: 'Email',
  google: 'Google',
};

export interface SignInMethods {
  /** True until the account list answers. Nothing about passwords is shown before then. */
  isPending: boolean;
  /** Whether a password exists at all. A Google-only account has none to change. */
  hasPassword: boolean;
  /** The providers the account signs in with, named for the user, e.g. `'Google'`. */
  providers: string[];
}

/**
 * What the account is signed in with. The server is the one that decides — it refuses a
 * password change on an account that has no password — and this asks it the same question
 * so the screen does not offer what the server would reject.
 */
export function useSignInMethods(): SignInMethods {
  const [methods, setMethods] = useState<SignInMethods>({
    isPending: true,
    hasPassword: false,
    providers: [],
  });

  useEffect(() => {
    let active = true;

    const read = async () => {
      const { data } = await authClient.listAccounts();
      const providers = data?.map((account) => account.providerId) ?? [];

      if (active) {
        setMethods({
          isPending: false,
          hasPassword: providers.includes(CREDENTIAL_PROVIDER),
          providers: providers.map((provider) => PROVIDER_LABELS[provider] ?? provider),
        });
      }
    };

    // A failed read leaves the password rows hidden, which is the safe way to be wrong:
    // the server would refuse the change anyway.
    read().catch(() => {
      if (active) {
        setMethods({ isPending: false, hasPassword: false, providers: [] });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return methods;
}
