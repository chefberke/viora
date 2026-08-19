import { useCallback, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

// SecureStore for the same reason the theme uses it: it is already a dependency and it
// reads synchronously, so the first frame renders with the stored value.
interface FlagStore {
  value: boolean;
  listeners: Set<() => void>;
}

const stores = new Map<string, FlagStore>();

function getStore(key: string): FlagStore {
  let store = stores.get(key);

  if (!store) {
    store = { value: SecureStore.getItem(key) === 'true', listeners: new Set() };
    stores.set(key, store);
  }

  return store;
}

/** The key for the "Summarize Food Text" setting, read by settings and the composer. */
export const SUMMARIZE_FOOD_TEXT_KEY = 'viora.summarize-food-text';

/** A boolean that survives restarts and stays in sync across every screen reading it. */
export function usePersistentFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        const store = getStore(key);

        store.listeners.add(listener);
        return () => store.listeners.delete(listener);
      },
      [key],
    ),
    () => getStore(key).value,
  );

  const setValue = useCallback(
    (next: boolean) => {
      const store = getStore(key);

      store.value = next;
      SecureStore.setItem(key, String(next));
      store.listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, setValue];
}
