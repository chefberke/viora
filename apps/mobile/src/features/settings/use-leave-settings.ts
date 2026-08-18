import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Out of the modal, to whatever is under it.
 *
 * React Navigation keeps the state of a group it drops, so a modal still open when the
 * session ends comes back with the group on the next sign-in — and comes back as the only
 * screen in the stack, with nothing behind it for `back()` to reach. Every way out of the
 * session leaves through here first, and the fallback covers a stack that is already in
 * that state.
 */
export function useLeaveSettings(): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canDismiss()) {
      router.dismissAll();
      return;
    }

    router.replace('/');
  }, [router]);
}
