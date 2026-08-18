const plugin = require('tailwindcss/plugin');

const { colors } = require('./src/theme/tokens');

/**
 * `{ background: '255 255 255' }` -> `{ '--color-background': '255 255 255' }`.
 *
 * @param {Record<string, string>} tokens
 * @returns {Record<string, string>}
 */
function toCssVariables(tokens) {
  return Object.fromEntries(
    Object.entries(tokens).map(([name, channels]) => [`--color-${name}`, channels]),
  );
}

/**
 * Backs every colour with its CSS variable, so `bg-surface` resolves per scheme with no
 * `dark:` prefix. `<alpha-value>` keeps modifiers such as `bg-surface/50` working.
 *
 * @param {Record<string, string>} tokens
 * @returns {Record<string, string>}
 */
function toThemeColors(tokens) {
  return Object.fromEntries(
    Object.keys(tokens).map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`]),
  );
}

const themeVariables = plugin(({ addBase }) => {
  addBase({
    ':root': toCssVariables(colors.light),
    // NativeWind rewrites this into a `prefers-color-scheme: dark` condition at build
    // time, so it follows the device with no `dark` class anywhere in the tree.
    '.dark:root': toCssVariables(colors.dark),
  });
});

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Not the default 'media': only class mode lets setColorScheme() override the system
  // theme later. See src/theme/theme-provider.tsx.
  darkMode: 'class',
  theme: {
    extend: {
      colors: toThemeColors(colors.light),
    },
  },
  plugins: [themeVariables],
};
