import { createContext, useContext, type ReactNode } from 'react';

import { useSelectedDay, type UseSelectedDayResult } from './use-selected-day';

const SelectedDayContext = createContext<UseSelectedDayResult | null>(null);

/**
 * Holds the day the log is showing for the whole stack, not just for the log screen.
 *
 * The calendar is a sheet on its own route, so it is a sibling of the log rather than a
 * child of it. There is no prop path between them: the day has to sit above both. That is
 * all this adds — `useSelectedDay` still owns the walking, the midnight reset and the rule
 * about which days can be reached.
 */
export function SelectedDayProvider({ children }: { children: ReactNode }) {
  const selected = useSelectedDay();

  return <SelectedDayContext.Provider value={selected}>{children}</SelectedDayContext.Provider>;
}

/** The day on screen, read from any route under the provider. */
export function useSelectedDayContext(): UseSelectedDayResult {
  const context = useContext(SelectedDayContext);

  if (!context) {
    throw new Error('useSelectedDayContext must be used inside a <SelectedDayProvider>.');
  }

  return context;
}
