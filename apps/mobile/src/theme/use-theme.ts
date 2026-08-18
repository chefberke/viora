import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from './theme-provider';

/** For values a Tailwind class cannot express. Regular styling stays in classNames. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }

  return context;
}
