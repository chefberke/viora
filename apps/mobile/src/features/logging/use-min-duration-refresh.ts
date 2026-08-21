import { useCallback, useRef, useState } from 'react';

/** The shortest time the bar stays up, so a fast fetch is still readable. */
const MIN_REFRESH_MS = 550;

export interface MinDurationRefresh {
  /** True while a refresh is running, including the padding that keeps it readable. */
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Pull-to-refresh with a floor under it.
 *
 * Two things it guarantees that a bare `refetch()` does not. A second pull while one is in
 * flight does nothing rather than stacking a second fetch behind the first. And a fetch that
 * returns in 40 ms still shows the bar for `MIN_REFRESH_MS`, because a status that appears
 * and vanishes inside two frames reads as a glitch rather than as an answer.
 *
 * `run` reports whether anything actually arrived, so the caller can decide what to do with
 * it — the log screen re-seeds its rows only on a fetch that succeeded.
 */
export function useMinDurationRefresh(run: () => Promise<boolean>): MinDurationRefresh {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) {
      return;
    }

    running.current = true;
    setIsRefreshing(true);

    const startedAt = Date.now();

    try {
      await run();
    } finally {
      const elapsed = Date.now() - startedAt;

      if (elapsed < MIN_REFRESH_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_MS - elapsed));
      }

      running.current = false;
      setIsRefreshing(false);
    }
  }, [run]);

  return { isRefreshing, refresh: () => void refresh() };
}
