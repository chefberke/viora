import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';

import type { SuggestionDto } from '@/shared/api-types';
import { ShimmerText } from '@/shared/ui';
import { useTheme } from '@/theme';
import { ROW_LINE_HEIGHT, ROW_TEXT_CLASS } from '../constants';
import { createEntry, isBlank, splitEntry, withText, type DraftEntry } from '../draft';
import type { RowState } from '../use-entry-parser';
import { EntryResultLabel } from './entry-result-label';
import { EntrySuggestion } from './entry-suggestion';
import { NeedsReviewHint } from './needs-review-hint';
import { NoFoodHint } from './no-food-hint';

/** Where the caret goes once a row opens, closes or joins. It waits for the row to mount. */
interface PendingFocus {
  id: string;
  /** The character the caret lands on. The end of the text when it is left out. */
  caret?: number;
}

/** A caret with nothing selected sits on one character; a selected range reads as -1. */
const NO_CARET = -1;

/** One pass of the shimmer over the accepted line. The same beat the suggestion arrived on. */
const MORPH_SWEEP_MS = 520;

/** How long the brand-coloured ghost of an accepted suggestion stays before fading. */
const MORPH_MS = 700;

export interface MealComposerProps {
  /** Rows to seed with — today's persisted entries. Row id doubles as the server id. */
  initialEntries?: readonly DraftEntry[];
  /** Per-row parse state, keyed by row id. */
  rowStates: ReadonlyMap<string, RowState>;
  /** Called with the full row list after every change; the parser hook diffs it. */
  onRowsChanged: (entries: readonly DraftEntry[]) => void;
  /** A row with a result was tapped (via its calorie/water label). */
  onRowPress: (id: string) => void;
  onRetryRow: (id: string) => void;
  /** What to offer on an empty row, best first. Empty when there is nothing worth offering. */
  suggestions: readonly SuggestionDto[];
  /** Pulling the rows down asks for the day again. */
  onRefresh: () => void;
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
export function MealComposer({
  initialEntries,
  rowStates,
  onRowsChanged,
  onRowPress,
  onRetryRow,
  suggestions,
  onRefresh,
}: MealComposerProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const [entries, setEntries] = useState<DraftEntry[]>(() =>
    initialEntries && initialEntries.length > 0 ? [...initialEntries] : [createEntry()],
  );

  // The id of a row whose text just morphed into its suggestion; drives the purple ghost.
  const [morphingId, setMorphingId] = useState<string | null>(null);

  // Which row the caret is in. Only that row is offered suggestions, so an empty row further
  // down the page does not sprout its own list.
  //
  // It is never cleared on blur. Blur runs before the suggestion's own press, so clearing it
  // there would unmount the line under the finger and eat the tap — `keyboardShouldPersistTaps`
  // keeps the touch alive, but not a node that has already gone. Focus moving to another row
  // overwrites it, and a deleted row clears it, which covers every case that matters.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const inputs = useRef(new Map<string, TextInput | null>());
  // The timer holding the ghost of an accepted suggestion. A second tap takes over from it.
  const morphTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Where the caret sits. The return key reads it to know how much of the line moves down,
  // and backspace to tell a delete inside the line from one at its very start.
  const carets = useRef(new Map<string, number>());
  const pendingFocus = useRef<PendingFocus | null>(null);

  // Every change to the rows — typing, splits, joins, closes — flows to the parser.
  useEffect(() => {
    onRowsChanged(entries);
  }, [entries, onRowsChanged]);

  // The ghost does not outlive the screen.
  useEffect(
    () => () => {
      if (morphTimer.current !== null) {
        clearTimeout(morphTimer.current);
      }
    },
    [],
  );

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

  /**
   * The tap on a suggestion: the row becomes that meal, and the ghost above it shimmers once
   * as it hands the line over — the same pass the suggestion itself arrived on, so the two
   * moments read as one thing finishing what it started.
   */
  function handleAcceptSuggestion(id: string, suggestion: string) {
    if (morphTimer.current !== null) {
      clearTimeout(morphTimer.current);
    }

    setEntries((prev) => withText(prev, id, suggestion));
    setMorphingId(id);

    morphTimer.current = setTimeout(() => {
      morphTimer.current = null;
      setMorphingId((current) => (current === id ? null : current));
    }, MORPH_MS);
  }

  /**
   * The hint's Delete: the row goes, and with it the entry the parser could make nothing
   * of. The parser hook reads the row list after every change, so the row leaving here is
   * what deletes it on the server too — see `removeRow` in ../use-entry-parser.ts.
   */
  function handleDeleteRow(id: string) {
    setFocusedId((current) => (current === id ? null : current));
    setEntries((prev) => {
      const next = prev.filter((entry) => entry.id !== id);

      // One row always stays, the same as it does everywhere else: an empty draft still
      // needs somewhere to write the first entry.
      return next.length > 0 ? next : [createEntry()];
    });
  }

  /** The parse landed, and there was no food in the line to land on. */
  function foundNoFood(entry: DraftEntry): boolean {
    const state = rowStates.get(entry.id);

    return state?.phase === 'done' && !!state.result && state.result.items.length === 0;
  }

  /**
   * How many of a row's foods the parse would like a person to look at.
   *
   * The mirror of the check above: that one is the parse failing, this one is the parse
   * succeeding and saying how sure it is. A corrected item is never counted — someone has
   * already looked at that one, and asking again would be the app not listening.
   */
  function unsureItems(entry: DraftEntry): number {
    const state = rowStates.get(entry.id);

    if (state?.phase !== 'done' || !state.result) {
      return 0;
    }

    return state.result.items.filter((item) => item.needsReview && !item.corrected).length;
  }

  /**
   * A row is offered suggestions only while it is the focused one and still empty. The first
   * character types them away: a list sitting under a line being written competes with it
   * instead of helping, and by then the person already knows what they are logging.
   */
  function showsSuggestions(entry: DraftEntry): boolean {
    return focusedId === entry.id && entry.text === '' && suggestions.length > 0;
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="grow gap-6 px-5 pb-6 pt-7"
      keyboardShouldPersistTaps="handled"
      // iOS holds the layout still when the keyboard opens, so the rows behind it would be
      // out of reach. The inset keeps the row being written on screen.
      automaticallyAdjustKeyboardInsets
      // The control is here for the pull alone; the waiting is shown by the bar under the
      // greeting. So it never holds itself open (`refreshing` stays false) and every colour
      // it draws with is clear — the platform spinner would be a second, competing answer.
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={onRefresh}
          tintColor="transparent"
          colors={['transparent']}
          progressBackgroundColor="transparent"
        />
      }
    >
      {entries.map((entry, index) => {
        const noFood = foundNoFood(entry);
        const unsure = unsureItems(entry);
        const prompt = index === 0 ? 'Start logging your meals...' : 'Add another meal...';

        return (
          <View key={entry.id} className="gap-1.5">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <TextInput
                  ref={(input) => {
                    inputs.current.set(entry.id, input);
                    return () => {
                      inputs.current.delete(entry.id);
                      carets.current.delete(entry.id);
                    };
                  }}
                  // `p-0`: Android hands a TextInput its theme's own padding, which would
                  // drop the writing below the label beside it. iOS already insets by nothing.
                  className={`${ROW_TEXT_CLASS} p-0 text-foreground`}
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
                  onFocus={() => setFocusedId(entry.id)}
                  onBlur={() => handleBlur(entry.id)}
                  // The prompt below stands in for `placeholder`, which can only wear the
                  // input's own type.
                  accessibilityLabel={prompt}
                  selectionColor={colors.brand}
                  // Wraps instead of scrolling sideways; the outer ScrollView owns scrolling.
                  multiline
                  scrollEnabled={false}
                  // The rows are the newlines here, so the key is an event rather than a
                  // character. It also keeps the keyboard up, which a blur would drop.
                  submitBehavior="submit"
                />

                {/* The empty row's prompt. It is drawn here rather than handed to
                    `placeholder` because it is a step smaller and greyer than the writing,
                    and RN gives the placeholder the input's size and nothing else. The line
                    height sets the smaller words on the line the caret is on. */}
                {entry.text === '' ? (
                  <Text
                    pointerEvents="none"
                    className="text-[1rem] text-foreground-subtle"
                    style={[StyleSheet.absoluteFill, { lineHeight: ROW_LINE_HEIGHT }]}
                  >
                    {prompt}
                  </Text>
                ) : null}

                {/* The accepted suggestion's ghost: the same text in brand purple with one
                    shimmer through it, fading into the ordinary row — the "mysterious" morph. */}
                {morphingId === entry.id ? (
                  <Animated.View
                    pointerEvents="none"
                    entering={FadeIn.duration(120)}
                    exiting={FadeOut.duration(500)}
                    style={StyleSheet.absoluteFill}
                  >
                    {reduceMotion ? (
                      <Text className={`${ROW_TEXT_CLASS} text-brand`}>{entry.text}</Text>
                    ) : (
                      <ShimmerText
                        text={entry.text}
                        base={colors.brand}
                        highlight={colors['brand-soft']}
                        textClassName={ROW_TEXT_CLASS}
                        sweepMs={MORPH_SWEEP_MS}
                        passes={1}
                      />
                    )}
                  </Animated.View>
                ) : null}
              </View>

              <EntryResultLabel
                state={rowStates.get(entry.id)}
                onPress={() => onRowPress(entry.id)}
                onRetry={() => onRetryRow(entry.id)}
              />
            </View>

            {showsSuggestions(entry) ? (
              <EntrySuggestion
                suggestions={suggestions}
                onAccept={(text) => handleAcceptSuggestion(entry.id, text)}
              />
            ) : null}

            {noFood ? (
              <NoFoodHint text={entry.text} onDelete={() => handleDeleteRow(entry.id)} />
            ) : unsure > 0 ? (
              <NeedsReviewHint count={unsure} onReview={() => onRowPress(entry.id)} />
            ) : null}
          </View>
        );
      })}

      <Pressable className="min-h-16 grow" onPress={handlePressBelow} accessible={false} />
    </ScrollView>
  );
}
