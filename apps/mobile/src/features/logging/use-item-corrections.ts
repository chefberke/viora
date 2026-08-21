import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError, logError, messageForError } from '@/shared/lib';
import type { CorrectionOpRequest, LogEntryDto } from '@/shared/api-types';
import { applyEntryToCache, correctEntry, entriesDayKey } from './api';

/**
 * What went wrong with a correction, as the sentence to show for it.
 *
 * It was a two-value union — `'moved' | 'failed'` — and the screen turned the second into
 * one fixed sentence, so a rate limit, a dead network and a server fault all read "That
 * change did not go through. Try again." The first of those three should not say "try
 * again" at all. `moved` keeps its own wording because it is the one failure this hook
 * knows more about than `messageForError` does: it also refetched the day.
 */
export type CorrectionError = { message: string } | null;

const MOVED: CorrectionError = {
  message: 'This entry changed while you were looking at it. Have another look and try again.',
};

export interface UseItemCorrections {
  /** Sends one edit. Resolves to whether it landed, so a picker can close on success only. */
  correct: (op: CorrectionOpRequest) => Promise<boolean>;
  /** The item index currently being written, or null. One row at a time. */
  busyIndex: number | null;
  error: CorrectionError;
  dismissError: () => void;
}

/**
 * Posting a person's corrections for one entry.
 *
 * Two things here are not the shape the rest of the app uses, and both are on purpose.
 *
 * The revision comes off the entry being rendered rather than from any counter of our own.
 * Every op says "item 2 of this list", and the only list that sentence is true of is the one
 * on the screen. The composer keeps a revision ref for its own debounced writes, but it is
 * optimistically a step ahead mid-flight and this screen cannot see it anyway.
 *
 * The cache write happens where the request does, not in an `onSuccess`. This runs inside a
 * sheet that can be dragged away at any moment; an unmounted observer's callbacks never run,
 * while the work already in flight runs to the end. Put the write here and a correction made
 * a moment before the sheet closes still lands on the row behind it.
 */
export function useItemCorrections(entry: LogEntryDto | undefined, day: number): UseItemCorrections {
  const queryClient = useQueryClient();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<CorrectionError>(null);
  // Not state: it guards the request itself, and a second tap must be refused in the same
  // tick rather than after a render.
  const inFlight = useRef(false);

  const correct = useCallback(
    async (op: CorrectionOpRequest): Promise<boolean> => {
      if (entry === undefined || inFlight.current) {
        return false;
      }

      inFlight.current = true;
      setBusyIndex(op.type === 'add_item' ? -1 : op.itemIndex);
      setError(null);

      try {
        const { entry: corrected } = await correctEntry(entry.id, {
          revision: entry.revision,
          ops: [op],
        });

        applyEntryToCache(queryClient, day, corrected);

        return true;
      } catch (caught) {
        // The row moved under the request. A correction cannot quietly lose the way an edit
        // can — it named a list that no longer exists — so the day is fetched again and the
        // person is told, rather than being left looking at a stale one that ignored them.
        if (caught instanceof ApiError && caught.status === 409) {
          void queryClient.invalidateQueries({ queryKey: entriesDayKey(day) });
          setError(MOVED);
        } else {
          const copy = messageForError(caught);

          logError(copy.event, caught, { entryId: entry?.id, day });
          setError({ message: copy.message });
        }

        return false;
      } finally {
        inFlight.current = false;
        setBusyIndex(null);
      }
    },
    [day, entry, queryClient],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { correct, busyIndex, error, dismissError };
}
