import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteEntry,
  entriesDayKey,
  fetchEntriesByDay,
  loggedDaysKey,
  upsertEntry,
} from './api';
import type { EntriesResponse, ParseResult } from './api-types';
import type { DraftEntry } from './draft';
import type { MacroTotals } from './types';

/** How long a row rests before its text is sent to be parsed. */
const DEBOUNCE_MS = 1000;

/** The shortest time the pull-to-refresh bar stays up, so a fast fetch is still readable. */
const MIN_REFRESH_MS = 550;

export type RowPhase = 'idle' | 'reading' | 'calculating' | 'done' | 'error';

export interface RowState {
  /** `reading` is a first parse, `calculating` a re-parse of an edited row. */
  phase: RowPhase;
  result: ParseResult | null;
}

export interface UseEntryParserResult {
  /** Today's persisted rows, or null while they load. The composer waits for them. */
  seedEntries: DraftEntry[] | null;
  /** Changes whenever `seedEntries` is a new take on the day; the composer remounts on it. */
  seedKey: string;
  rowStates: ReadonlyMap<string, RowState>;
  totals: MacroTotals;
  waterMl: number;
  /** The composer reports its full row list here after every change. */
  onRowsChanged: (entries: readonly DraftEntry[]) => void;
  retryRow: (id: string) => void;
  /** True while a pull-to-refresh fetch is running. Drives the loading bar. */
  isRefreshing: boolean;
  /** Fetches the day again and re-seeds the rows from what came back. */
  refresh: () => void;
}

/**
 * The brain between the composer and the API. Each row debounces, parses and errors on
 * its own; a per-row revision counter makes edits safe — the server compare-and-sets on
 * it, and a response for anything but the newest revision is dropped here too.
 */
export function useEntryParser(day: number): UseEntryParserResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: entriesDayKey(day),
    queryFn: () => fetchEntriesByDay(day),
  });

  const { refetch } = query;

  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Bumped by a refresh so the render-phase seeding below runs again on the fresh data.
  const [seedVersion, setSeedVersion] = useState(0);
  const seedKey = `${day}:${seedVersion}`;

  // The callbacks below live outside React's render cycle on purpose: a keystroke must
  // not re-create timers, and a response must check against the newest revision.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const revisions = useRef(new Map<string, number>());
  const lastSent = useRef(new Map<string, string>());
  const latestText = useRef(new Map<string, string>());
  const statesRef = useRef(rowStates);
  const seededKey = useRef<string | null>(null);
  const refreshing = useRef(false);

  statesRef.current = rowStates;

  const setRow = useCallback((id: string, partial: Partial<RowState>) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = prev.get(id) ?? { phase: 'idle' as const, result: null };

      next.set(id, { ...current, ...partial });
      return next;
    });
  }, []);

  const dropRow = useCallback((id: string) => {
    setRowStates((prev) => {
      if (!prev.has(id)) {
        return prev;
      }

      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Seed once per day from the persisted entries, before the composer mounts.
  const seedEntries = useMemo(() => {
    if (!query.isFetched) {
      return null;
    }

    return (query.data?.entries ?? []).map((entry) => ({ id: entry.id, text: entry.rawText }));
  }, [query.isFetched, query.data]);

  // Render-phase seeding, not an effect: the composer mounts in the same render and
  // reports its rows from a child effect, which runs BEFORE a parent effect would.
  // The refs must already know the seeded rows by then, or every persisted row would
  // read as new and be re-parsed — and after midnight, worse, deleted.
  if (seedEntries !== null && seededKey.current !== seedKey) {
    seededKey.current = seedKey;

    for (const timer of timers.current.values()) {
      clearTimeout(timer);
    }

    timers.current.clear();
    latestText.current.clear();
    lastSent.current.clear();
    revisions.current.clear();

    const seeded = new Map<string, RowState>();

    for (const entry of query.data?.entries ?? []) {
      latestText.current.set(entry.id, entry.rawText);
      lastSent.current.set(entry.id, entry.rawText);
      revisions.current.set(entry.id, entry.revision);
      seeded.set(entry.id, {
        phase: entry.status === 'parsed' ? 'done' : 'error',
        result: entry.result,
      });
    }

    setRowStates(seeded);
  }

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);

    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const send = useCallback(
    async (id: string, text: string) => {
      const revision = (revisions.current.get(id) ?? 0) + 1;

      revisions.current.set(id, revision);
      lastSent.current.set(id, text);
      setRow(id, { phase: statesRef.current.get(id)?.result ? 'calculating' : 'reading' });

      try {
        const { entry } = await upsertEntry(id, { rawText: text, day, revision });

        // A newer edit is already in flight (or pending): this result is history.
        if (revisions.current.get(id) !== revision) {
          return;
        }

        revisions.current.set(id, entry.revision);
        setRow(id, { phase: 'done', result: entry.result });

        queryClient.setQueryData<EntriesResponse>(entriesDayKey(day), (old) => ({
          entries: [...(old?.entries ?? []).filter((item) => item.id !== entry.id), entry],
        }));
        // The water sheet reads a range query and the day walk reads the logged days;
        // both are cheap to refresh and wrong to leave stale.
        void queryClient.invalidateQueries({ queryKey: ['entries-range'] });
        void queryClient.invalidateQueries({ queryKey: loggedDaysKey() });
      } catch (error) {
        if (revisions.current.get(id) !== revision) {
          return;
        }

        // A stale-revision refusal means a newer request won the race — nothing to show.
        if (error instanceof Error && error.message === 'revision_conflict') {
          return;
        }

        setRow(id, { phase: 'error' });
      }
    },
    [day, queryClient, setRow],
  );

  const schedule = useCallback(
    (id: string) => {
      clearTimer(id);

      timers.current.set(
        id,
        setTimeout(() => {
          timers.current.delete(id);

          const text = (latestText.current.get(id) ?? '').trim();

          if (text === '') {
            return;
          }

          // The text came back to what the server already parsed (a trim, an undo).
          const settled = statesRef.current.get(id);

          if (lastSent.current.get(id)?.trim() === text && settled?.phase === 'done') {
            return;
          }

          void send(id, text);
        }, DEBOUNCE_MS),
      );
    },
    [clearTimer, send],
  );

  const removeRow = useCallback(
    (id: string) => {
      clearTimer(id);
      latestText.current.delete(id);
      // Bump so any in-flight response for this row is dropped on arrival.
      revisions.current.set(id, (revisions.current.get(id) ?? 0) + 1);

      if (lastSent.current.has(id)) {
        lastSent.current.delete(id);
        // Fire-and-forget: the delete is idempotent and a miss costs nothing.
        deleteEntry(id).catch(() => {});
        queryClient.setQueryData<EntriesResponse>(entriesDayKey(day), (old) => ({
          entries: (old?.entries ?? []).filter((item) => item.id !== id),
        }));
        void queryClient.invalidateQueries({ queryKey: ['entries-range'] });
        void queryClient.invalidateQueries({ queryKey: loggedDaysKey() });
      }

      revisions.current.delete(id);
      dropRow(id);
    },
    [clearTimer, day, dropRow, queryClient],
  );

  const onRowsChanged = useCallback(
    (entries: readonly DraftEntry[]) => {
      const present = new Set(entries.map((entry) => entry.id));

      for (const id of [...latestText.current.keys()]) {
        if (!present.has(id)) {
          removeRow(id);
        }
      }

      for (const entry of entries) {
        const previous = latestText.current.get(entry.id);

        latestText.current.set(entry.id, entry.text);

        if (previous === entry.text) {
          continue;
        }

        if (entry.text.trim() === '') {
          // Emptied, but the row is still open. The server entry goes; the row stays.
          clearTimer(entry.id);

          if (lastSent.current.has(entry.id)) {
            const id = entry.id;

            lastSent.current.delete(id);
            revisions.current.set(id, (revisions.current.get(id) ?? 0) + 1);
            deleteEntry(id).catch(() => {});
            queryClient.setQueryData<EntriesResponse>(entriesDayKey(day), (old) => ({
              entries: (old?.entries ?? []).filter((item) => item.id !== id),
            }));
            void queryClient.invalidateQueries({ queryKey: ['entries-range'] });
            void queryClient.invalidateQueries({ queryKey: loggedDaysKey() });
            dropRow(id);
          }

          continue;
        }

        schedule(entry.id);
      }
    },
    [clearTimer, day, dropRow, queryClient, removeRow, schedule],
  );

  const retryRow = useCallback(
    (id: string) => {
      const text = (latestText.current.get(id) ?? '').trim();

      if (text !== '') {
        void send(id, text);
      }
    },
    [send],
  );

  /**
   * Pull-to-refresh. It fetches the day again and then bumps the seed, which re-runs the
   * seeding above and remounts the composer on the rows that came back — so a change made
   * on another device shows up here. Text still waiting on the debounce is not sent first,
   * so a refresh in the middle of typing gives that row back as the server last saw it.
   */
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      return;
    }

    refreshing.current = true;
    setIsRefreshing(true);

    const startedAt = Date.now();

    try {
      const result = await refetch();

      // A failed fetch leaves the cache as it was, so there is nothing new to seed from.
      if (!result.isError) {
        setSeedVersion((version) => version + 1);
      }
    } finally {
      const elapsed = Date.now() - startedAt;

      if (elapsed < MIN_REFRESH_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_REFRESH_MS - elapsed));
      }

      refreshing.current = false;
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Timers do not outlive the screen.
  useEffect(() => {
    const pending = timers.current;

    return () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }

      pending.clear();
    };
  }, []);

  const { totals, waterMl } = useMemo(() => {
    let calories = 0;
    let carbs = 0;
    let protein = 0;
    let fat = 0;
    let water = 0;

    for (const state of rowStates.values()) {
      const rowTotals = state.result?.totals;

      if (!rowTotals) {
        continue;
      }

      calories += rowTotals.calories;
      carbs += rowTotals.carbs;
      protein += rowTotals.protein;
      fat += rowTotals.fat;
      water += rowTotals.waterMl;
    }

    return {
      totals: {
        calories,
        carbs: Math.round(carbs),
        protein: Math.round(protein),
        fat: Math.round(fat),
      },
      waterMl: water,
    };
  }, [rowStates]);

  return {
    seedEntries,
    seedKey,
    rowStates,
    totals,
    waterMl,
    onRowsChanged,
    retryRow,
    isRefreshing,
    refresh,
  };
}
