import { onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

/**
 * Tells TanStack Query whether the phone is on a network.
 *
 * Without this the default is "always online": every query fires into a dead socket, waits
 * out the hundred-second timeout in `api.ts`, retries once, and only then reports a
 * failure that a person could have been told about immediately. Wiring the real answer in
 * is what makes queries pause instead, and — the half that matters more — makes a mutation
 * wait rather than fail, so a meal typed in a lift is sent when the doors open.
 *
 * `isInternetReachable` is preferred over `isConnected` where the platform provides it,
 * because the case this exists for is not really "no wifi". It is the hotel network that
 * is connected and answers nothing, which `isConnected` alone reports as fine.
 */
function isOnline(state: { isConnected?: boolean; isInternetReachable?: boolean }): boolean {
  return state.isInternetReachable ?? state.isConnected ?? true;
}

/**
 * Imported for its side effect, once, from the root layout. It has to run before the first
 * query does — a listener installed later would leave the app believing it is online until
 * the connection first *changes*, which on a phone that started offline is never.
 */
onlineManager.setEventListener((setOnline) => {
  // The listener only fires on change, so the current state has to be asked for. A failure
  // here leaves the manager at its default of online, which is the right way to be wrong:
  // an app that wrongly believes it is offline refuses to work at all.
  void getNetworkStateAsync()
    .then((state) => setOnline(isOnline(state)))
    .catch(() => setOnline(true));

  const subscription = addNetworkStateListener((state) => setOnline(isOnline(state)));

  return () => subscription.remove();
});

export { onlineManager };
