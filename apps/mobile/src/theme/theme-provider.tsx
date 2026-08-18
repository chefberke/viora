import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colorScheme as nativeWindColorScheme, useColorScheme } from 'nativewind';

import {
  palette,
  shadows,
  type ColorScheme,
  type ColorToken,
  type ThemePreference,
} from './palette';

export interface ThemeContextValue {
  preference: ThemePreference;
  /** What is on screen right now, after resolving `'system'`. */
  scheme: ColorScheme;
  isDark: boolean;
  colors: Record<ColorToken, string>;
  /** Drop shadow for surfaces that float above the background. Empty in dark. */
  shadow: ViewStyle;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

// SecureStore, not AsyncStorage, only because the auth client already depends on it.
// A theme is not a secret; what matters is the synchronous read below.
const STORAGE_KEY = 'viora.theme-preference';

function readStoredPreference(): ThemePreference {
  const stored = SecureStore.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

// At import time, before the first frame: NativeWind starts on the device appearance, so
// pushing a stored 'light' from an effect would paint one dark frame first.
nativeWindColorScheme.set(readStoredPreference());

/** Owns the theme preference and pushes it into NativeWind. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Seeded from storage, the same value the module-scope `set` above already applied.
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);

  // NativeWind resolves 'system' for us, so this is always concrete.
  const { colorScheme, setColorScheme } = useColorScheme();
  const scheme: ColorScheme = colorScheme ?? 'light';

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      // Throws unless tailwind.config.js sets `darkMode: 'class'`.
      setColorScheme(next);
      SecureStore.setItem(STORAGE_KEY, next);
    },
    [setColorScheme],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      isDark: scheme === 'dark',
      colors: palette[scheme],
      shadow: shadows[scheme],
      setPreference,
    }),
    [preference, scheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
