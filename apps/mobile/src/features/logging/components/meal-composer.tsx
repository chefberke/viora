import { useEffect, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';
import type { ComposerStatus } from '../types';
import { ComposerStatusLabel } from './composer-status';

interface DraftEntry {
  id: string;
  text: string;
}

let entryIdCounter = 0;

function createEntry(text: string): DraftEntry {
  entryIdCounter += 1;
  return { id: `entry-${entryIdCounter}`, text };
}

export interface MealComposerProps {
  /** Lines to seed the composer with. One entry per line. */
  initialEntries?: readonly string[];
  status?: ComposerStatus;
}

/**
 * Free-text entry for meals. It reads as one writing area, but every line is its own
 * input row: iOS puts the extra leading of `lineHeight` above each line, so one multiline
 * field would push the first line out of view. A flex gap between rows gives the spacing.
 */
export function MealComposer({ initialEntries, status = 'idle' }: MealComposerProps) {
  const { colors } = useTheme();

  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    (initialEntries?.length ? [...initialEntries] : ['']).map(createEntry),
  );

  const inputRefs = useRef(new Map<string, TextInput | null>());
  // Focus can only move once the new row is mounted, so it waits for that render.
  const pendingFocusId = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocusId.current;

    if (id === null) {
      return;
    }

    pendingFocusId.current = null;
    inputRefs.current.get(id)?.focus();
  });

  /**
   * A newline starts the next entry, so everything after it moves into new rows. Handled
   * here rather than on the return key, which also covers pasted multi-line text.
   */
  function handleChangeText(id: string, text: string) {
    if (!text.includes('\n')) {
      setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, text } : entry)));
      return;
    }

    const [head = '', ...tail] = text.split('\n');
    const added = tail.map(createEntry);

    pendingFocusId.current = added[added.length - 1]?.id ?? null;
    setEntries((prev) =>
      prev.flatMap((entry) => (entry.id === id ? [{ ...entry, text: head }, ...added] : [entry])),
    );
  }

  /** Backspace on an empty row removes it, so entries can be joined back up. */
  function handleBackspace(id: string) {
    const index = entries.findIndex((entry) => entry.id === id);

    if (index <= 0 || entries[index]?.text !== '') {
      return;
    }

    pendingFocusId.current = entries[index - 1]?.id ?? null;
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-6 px-5 pb-6 pt-5"
      keyboardShouldPersistTaps="handled"
    >
      {entries.map((entry, index) => (
        <View key={entry.id} className="flex-row items-start gap-3">
          <TextInput
            ref={(input) => {
              inputRefs.current.set(entry.id, input);
              return () => {
                inputRefs.current.delete(entry.id);
              };
            }}
            className="flex-1 text-lg text-foreground"
            value={entry.text}
            onChangeText={(text) => handleChangeText(entry.id, text)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace') {
                handleBackspace(entry.id);
              }
            }}
            placeholder={index === 0 ? 'Start logging your meals...' : undefined}
            placeholderTextColor={colors['foreground-muted']}
            selectionColor={colors['action-voice']}
            // Wraps instead of scrolling sideways; the outer ScrollView owns scrolling.
            multiline
            scrollEnabled={false}
          />

          {index === 0 ? <ComposerStatusLabel status={status} /> : null}
        </View>
      ))}
    </ScrollView>
  );
}
