import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useMinDurationRefresh } from './use-min-duration-refresh';
import { useMinuteOfDay } from './use-minute-of-day';
import {
  applyEntryToCache,
  deleteEntry,
  dropEntryFromCache,
  entriesDayKey,
  fetchEntriesByDay,
  upsertEntry,
} from './api';
import { ApiError, logError, messageForError, onlineManager } from '@/shared/lib';
import type { ParseResult } from '@/shared/api-types';
import type { DraftEntry } from './draft';
import { sumTotals, type MacroTotals } from '@/shared/macros';

/** How long a row rests before its text is sent to be parsed. */
const DEBOUNCE_MS = 1000;

export type RowPhase = 'idle' | 'reading' | 'calculating' | 'queued' | 'done' | 'error';

export interface RowState {
  /** `reading` is a first parse, `calculating` a re-parse of an edited row. */
  phase: RowPhase;
  result: ParseResult | null;
  /**
   * What to tell the person about a failed row, from `messageForError`. Null on every
   * other phase.
   *
   * It is held per row rather than derived at render because the error object itself is
   * gone by then — `send` catches it, and the row only remembers that something went
   * wrong. Before this, a rate limit, a dead network and a bad request all rendered the
   * same red "Retry", and one of those three should not offer a retry at all.
   */
  error: { message: string; retry: boolean } | null;
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
  /**
   * No usable connection. Rows still accept text and park until it comes back.
   *
   * Separate from `isError`: one is the phone's fault and self-healing, the other is the
   * server's and is not.
   */
  isOffline: boolean;
  /**
   * The day itself could not be loaded.
   *
   * It used to be invisible. `seedEntries` returned `[]` as soon as the query had *fetched*,
   * error or not, so a failed day rendered as an empty day with a working composer — which
   * invites someone to retype a breakfast they already logged.
   */
  isError: boolean;
}

/**
 * The brain between the composer and the API. Each row debounces, parses and errors on
 * its own; a per-row revision counter makes edits safe — the server compare-and-sets on
 * it, and a response for anything but the newest revision is dropped here too.
 */
export function useEntryParser(day: number): UseEntryParserResult {
  const queryClient = useQueryClient();
  const minuteOfDayFor = useMinuteOfDay();
  const query = useQuery({
    queryKey: entriesDayKey(day),
    queryFn: () => fetchEntriesByDay(day),
  });

  const { refetch } = query;

  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [isOffline, setIsOffline] = useState(!onlineManager.isOnline());
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

  statesRef.current = rowStates;

  const setRow = useCallback((id: string, partial: Partial<RowState>) => {
    setRowStates((prev) => {
      const next = new Map(prev);
      const current = prev.get(id) ?? { phase: 'idle' as const, result: null, error: null };

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
        // A row seeded as failed came back that way from a parse in some earlier session.
        // Whatever went wrong then is not knowable now, so it gets the generic retry
        // rather than a sentence invented after the fact.
        error: entry.status === 'parsed' ? null : { message: 'Something went wrong.', retry: true },
      });
    }

    setRowStates(seeded);
  }

  // A correction is made in the nutrition sheet, which writes the entry back into the day
  // query and never touches anything in here. Without this pass the sheet would show the
  // corrected calories while the composer row beside it, and the day total summed from these
  // states, both went on showing the old ones until a pull-to-refresh.
  //
  // Deliberately lighter than the seeding above: the revision and the figures move, the text
  // refs do not — a correction never changes what was written — and `seedKey` is left alone,
  // because bumping it remounts the composer and would take the caret with it. One pass
  // settles, since the pass itself writes the new revision into the ref.
  const corrected = (query.data?.entries ?? []).filter(
    (entry) => (revisions.current.get(entry.id) ?? Infinity) < entry.revision,
  );

  if (corrected.length > 0) {
    for (const entry of corrected) {
      revisions.current.set(entry.id, entry.revision);
    }

    setRowStates((prev) => {
      const next = new Map(prev);

      for (const entry of corrected) {
        next.set(entry.id, {
          phase: entry.status === 'parsed' ? 'done' : 'error',
          result: entry.result,
          error:
            entry.status === 'parsed' ? null : { message: 'Something went wrong.', retry: true },
        });
      }

      return next;
    });
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
        const { entry } = await upsertEntry(id, {
          rawText: text,
          day,
          revision,
          minuteOfDay: minuteOfDayFor(day),
        });

        // A newer edit is already in flight (or pending): this result is history.
        if (revisions.current.get(id) !== revision) {
          return;
        }

        revisions.current.set(id, entry.revision);
        setRow(id, { phase: 'done', result: entry.result, error: null });

        applyEntryToCache(queryClient, day, entry);
      } catch (error) {
        if (revisions.current.get(id) !== revision) {
          return;
        }

        // A stale-revision refusal means a newer request won the race — nothing to show.
        if (error instanceof ApiError && error.status === 409) {
          return;
        }

        const copy = messageForError(error);

        logError(copy.event, error, { entryId: id, revision });
        setRow(id, { phase: 'error', error: { message: copy.message, retry: copy.retry } });
      }
    },
    [day, minuteOfDayFor, queryClient, setRow],
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

          // Parked rather than sent. The text is already in `latestText`, so the reconnect
          // effect below has everything it needs; sending anyway would spend the hundred-
          // second timeout in `api.ts` to learn what `onlineManager` already knows.
          if (!onlineManager.isOnline()) {
            setRow(id, { phase: 'queued', error: null });

            return;
          }

          void send(id, text);
        }, DEBOUNCE_MS),
      );
    },
    [clearTimer, send, setRow],
  );

  const removeRow = useCallback(
    (id: string) => {
      clearTimer(id);
      latestText.current.delete(id);
      // Bump so any in-flight response for this row is dropped on arrival.
      revisions.current.set(id, (revisions.current.get(id) ?? 0) + 1);

      if (lastSent.current.has(id)) {
        lastSent.current.delete(id);
        // Fire-and-forget: the delete is idempotent and a miss costs nothing to the person.
        // It is still written down — "costs nothing" was a claim nobody could check.
        deleteEntry(id).catch((error: unknown) => logError('entry_delete_failed', error, { entryId: id }));
        dropEntryFromCache(queryClient, day, id);
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
            deleteEntry(id).catch((error: unknown) =>
              logError('entry_delete_failed', error, { entryId: id }),
            );
            dropEntryFromCache(queryClient, day, id);
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
   *
   * The reentrancy guard and the readable-minimum floor live in `useMinDurationRefresh`;
   * what belongs here is only what to do with the result.
   */
  const { isRefreshing, refresh } = useMinDurationRefresh(
    useCallback(async () => {
      const result = await refetch();

      // A failed fetch leaves the cache as it was, so there is nothing new to seed from.
      // The failure itself reaches the screen through `query.isError`, and the log line is
      // what says which failure it was.
      if (result.isError) {
        logError(messageForError(result.error).event, result.error, { day });

        return false;
      }

      setSeedVersion((version) => version + 1);

      return true;
    }, [refetch, day]),
  );

  /**
   * Connection state, and the rows that were waiting for it.
   *
   * `onlineManager` pauses TanStack Query's own work by itself; parked composer rows are
   * not queries, so they need this. Everything a parked row needs is already in
   * `latestText` — the text is what was typed, not what was sent — so coming back is just
   * sending it now.
   */
  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOffline(!online);

      if (!online) {
        return;
      }

      for (const [id, state] of statesRef.current) {
        if (state.phase !== 'queued') {
          continue;
        }

        const text = (latestText.current.get(id) ?? '').trim();

        if (text !== '') {
          void send(id, text);
        }
      }
    });

    return unsubscribe;
  }, [send]);

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

  const { totals, waterMl } = useMemo(() => sumTotals(rowStates.values()), [rowStates]);

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
    isOffline,
    isError: query.isError,
  };
}
