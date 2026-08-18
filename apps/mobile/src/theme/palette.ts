import type { ViewStyle } from 'react-native';

import { colors, elevation } from './tokens';

export type ColorScheme = 'light' | 'dark';

/** What the user asked for. `'system'` means "follow the device". */
export type ThemePreference = ColorScheme | 'system';

export type ColorToken = keyof typeof colors.light;

/**
 * For the few props that only take a colour value — `placeholderTextColor`,
 * `selectionColor`, navigator `contentStyle`. Everything else should use a class.
 */
export const palette: Record<ColorScheme, Record<ColorToken, string>> = {
  light: toColorStrings(colors.light),
  dark: toColorStrings(colors.dark),
};

/** Lifts a surface off the background. Shadows have no per-scheme Tailwind equivalent. */
export const shadows: Record<ColorScheme, ViewStyle> = {
  light: toShadowStyle(elevation.light),
  dark: toShadowStyle(elevation.dark),
};

/** `'255 255 255'` -> `'rgb(255 255 255)'`. */
function toColorStrings(tokens: Record<ColorToken, string>): Record<ColorToken, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, channels]) => [name, `rgb(${channels})`]),
  ) as Record<ColorToken, string>;
}

function toShadowStyle(tokens: (typeof elevation)['light']): ViewStyle {
  return {
    shadowColor: tokens.shadowColor,
    shadowOpacity: tokens.shadowOpacity,
    shadowRadius: tokens.shadowRadius,
    shadowOffset: { width: 0, height: tokens.shadowOffsetHeight },
    elevation: tokens.androidElevation,
  };
}
