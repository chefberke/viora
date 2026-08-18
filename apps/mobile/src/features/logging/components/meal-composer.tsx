import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import { createEntry, isBlank, splitEntry, toEntries, withText, type DraftEntry } from '../draft';
import type { ComposerStatus } from '../types';
import { ComposerStatusLabel } from './composer-status';

/** Where the caret goes once a row opens, closes or joins. It waits for the row to mount. */
interface PendingFocus {
  id: string;
  /** The character the caret lands on. The end of the text when it is left out. */
  caret?: number;
}

/** A caret with nothing selected sits on one character; a selected range reads as -1. */
const NO_CARET = -1;

export interface MealComposerProps {
  /** Lines to seed the composer with. One entry per line. */
  initialEntries?: readonly string[];
  status?: ComposerStatus;
}

/**
 * Free-text entry for meals. It reads as one writing area, but every line is its own input
 * row: iOS puts the extra leading of `lineHeight` above each line, so one multiline field
 * would push the first line out of view. A flex gap between rows gives the spacing.
 *
 * The rows are also what the return key means here. It does not break a paragraph, it ends
 * the entry and opens the next one — and on a blank row it does nothing at all, because a
 * row with no writing in it is not an entry. See ../draft.ts.
 */
export function MealComposer({ initialEntries, status = 'idle' }: MealComposerProps) {
  const { colors } = useTheme();

  const [entries, setEntries] = useState<DraftEntry[]>(() => toEntries(initialEntries));

  const inputs = useRef(new Map<string, TextInput | null>());
  // Where the caret sits. The return key reads it to know how much of the line moves down,
  // and backspace to tell a delete inside the line from one at its very start.
  const carets = useRef(new Map<string, number>());
  const pendingFocus = useRef<PendingFocus | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;

    if (pending === null) {
      return;
    }

    pendingFocus.current = null;
    focusRow(pending.id, pending.caret);
  });

  function focusRow(id: string, caret?: number) {
    const input = inputs.current.get(id);

    input?.focus();

    if (caret !== undefined) {
      input?.setSelection(caret, caret);
    }
  }

  /**
   * The return key ends the entry and opens the next one. It never writes a newline into
   * the row itself: `submitBehavior="submit"` hands the key here instead, so a return the
   * draft cannot take changes nothing on screen — no line appears and disappears again.
   */
  function handleSubmit(id: string) {
    const entry = entries.find((item) => item.id === id);

    // A blank row is not an entry yet, so there is nothing to end.
    if (!entry || isBlank(entry.text)) {
      return;
    }

    // The caret is where the entry ends, so whatever sits after it moves down with it.
    const caret = carets.current.get(id) ?? NO_CARET;
    const cut = caret === NO_CARET ? entry.text.length : caret;

    applySplit(id, `${entry.text.slice(0, cut)}\n${entry.text.slice(cut)}`);
  }

  /** Pasted text can carry newlines of its own, and each one starts an entry just the same. */
  function handleChangeText(id: string, text: string) {
    if (!text.includes('\n')) {
      setEntries((prev) => withText(prev, id, text));
      return;
    }

    applySplit(id, text);
  }

  function applySplit(id: string, text: string) {
    const split = splitEntry(entries, id, text);

    pendingFocus.current = { id: split.focusId, caret: split.focusCaret };
    setEntries(split.entries);
  }

  /**
   * Backspace at the start of a row joins it to the row above, whether it still holds text
   * or was emptied first. The caret lands where the two meet, so the next press deletes
   * from the same place the eye is on.
   */
  function handleBackspace(id: string) {
    const index = entries.findIndex((entry) => entry.id === id);
    const current = entries[index];
    const previous = entries[index - 1];

    if (index <= 0 || !current || !previous) {
      return;
    }

    // An empty row reports no caret of its own on every platform, and it has only the one
    // place a caret could be.
    const caret = current.text === '' ? 0 : (carets.current.get(id) ?? NO_CARET);

    if (caret !== 0) {
      return;
    }

    pendingFocus.current = { id: previous.id, caret: previous.text.length };
    setEntries(
      withText(entries, previous.id, previous.text + current.text).filter(
        (entry) => entry.id !== id,
      ),
    );
  }

  /** A row the caret leaves has to hold something, so a blank one closes as it is left. */
  function handleBlur(id: string) {
    const entry = entries.find((item) => item.id === id);

    if (!entry) {
      return;
    }

    // One row always stays: an empty draft still needs somewhere to write the first entry.
    if (isBlank(entry.text) && entries.length > 1) {
      setEntries((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    if (entry.text !== entry.text.trim()) {
      setEntries((prev) => withText(prev, id, entry.text.trim()));
    }
  }

  /** The room under the last row is part of the writing area, so pressing it writes on. */
  function handlePressBelow() {
    const last = entries[entries.length - 1];

    if (last && isBlank(last.text)) {
      focusRow(last.id);
      return;
    }

    const opened = createEntry();

    pendingFocus.current = { id: opened.id };
    setEntries((prev) => [...prev, opened]);
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="grow gap-6 px-5 pb-6 pt-5"
      keyboardShouldPersistTaps="handled"
      // iOS holds the layout still when the keyboard opens, so the rows behind it would be
      // out of reach. The inset keeps the row being written on screen.
      automaticallyAdjustKeyboardInsets
    >
      {entries.map((entry, index) => (
        <View key={entry.id} className="flex-row items-start gap-3">
          <TextInput
            ref={(input) => {
              inputs.current.set(entry.id, input);
              return () => {
                inputs.current.delete(entry.id);
                carets.current.delete(entry.id);
              };
            }}
            className="flex-1 text-lg text-foreground"
            value={entry.text}
            onChangeText={(text) => handleChangeText(entry.id, text)}
            onSelectionChange={({ nativeEvent: { selection } }) => {
              carets.current.set(
                entry.id,
                selection.start === selection.end ? selection.start : NO_CARET,
              );
            }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace') {
                handleBackspace(entry.id);
              }
            }}
            onSubmitEditing={() => handleSubmit(entry.id)}
            onBlur={() => handleBlur(entry.id)}
            placeholder={index === 0 ? 'Start logging your meals...' : 'Add another meal...'}
            placeholderTextColor={colors['foreground-muted']}
            selectionColor={colors['action-voice']}
            // Wraps instead of scrolling sideways; the outer ScrollView owns scrolling.
            multiline
            scrollEnabled={false}
            // The rows are the newlines here, so the key is an event rather than a
            // character. It also keeps the keyboard up, which a blur would drop.
            submitBehavior="submit"
          />

          {index === 0 ? <ComposerStatusLabel status={status} /> : null}
        </View>
      ))}

      <Pressable className="min-h-16 grow" onPress={handlePressBelow} accessible={false} />
    </ScrollView>
  );
}
