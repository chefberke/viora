import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui';
import { WATER_GLYPH } from '@/shared/macros';
import { CONFIDENCE, CONFIDENCE_SPOKEN, ROW_TEXT_CLASS } from '../constants';
import type { RowState } from '../use-entry-parser';
import { ParsePhaseLabel } from './parse-phase-label';

// The row's own type, so the label starts on the same line as the writing. See constants.ts.
const LABEL_CLASS = ROW_TEXT_CLASS;

/**
 * The right edge of a composer row: shimmering phase words while the parse runs, the
 * outcome once it lands — calories for food, blue millilitres for water — and, when the
 * parse did not land, what to do about it.
 *
 * There are three failure endings, not one. A row with no connection is waiting and will
 * send itself. A row the server refused for a reason retrying cannot change says so and
 * offers nothing. Everything else offers the retry.
 */
export function EntryResultLabel({
  state,
  onPress,
  onRetry,
}: {
  state: RowState | undefined;
  /** Opens the matching sheet; only wired once there is a result to show. */
  onPress: () => void;
  onRetry: () => void;
}) {
  if (!state || state.phase === 'idle') {
    return null;
  }

  if (state.phase === 'reading' || state.phase === 'calculating') {
    return <ParsePhaseLabel phase={state.phase} />;
  }

  // Typed rather than written down: the row parked because there is no connection, and it
  // will send itself when there is. Offering "Retry" here would be offering a button that
  // does the thing the app is already going to do.
  if (state.phase === 'queued') {
    return (
      <Text
        className={`${LABEL_CLASS} text-foreground-subtle`}
        accessibilityLabel="Waiting for a connection"
      >
        Waiting
      </Text>
    );
  }

  if (state.phase === 'error') {
    // Not every failure is worth a retry, and the ones that are not used to get one anyway.
    // A 413 retried sends the identical body; a timeout retried can log the meal twice,
    // because the server may have finished after the phone stopped listening.
    if (state.error && !state.error.retry) {
      return (
        <Text className={`${LABEL_CLASS} text-danger`} accessibilityLabel={state.error.message}>
          Not sent
        </Text>
      );
    }

    return (
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        accessibilityLabel={state.error?.message ?? 'Retry parsing this entry'}
      >
        <Text className={`${LABEL_CLASS} text-danger`}>Retry</Text>
      </Pressable>
    );
  }

  const result = state.result;

  if (!result) {
    return null;
  }

  // The parser read the line and found no food in it. Not tappable — there is nothing to
  // open — but a dash read aloud on its own is not an answer, so it says what it means.
  if (result.items.length === 0) {
    return (
      <Text
        className={`${LABEL_CLASS} text-foreground-subtle`}
        accessibilityLabel="No food found in this line"
      >
        —
      </Text>
    );
  }

  if (result.kind === 'water') {
    return (
      <Pressable onPress={onPress} hitSlop={8} accessibilityLabel="Open water details">
        <Text className={`${LABEL_CLASS} text-water`}>
          {WATER_GLYPH} {result.totals.waterMl} ml
        </Text>
      </Pressable>
    );
  }

  const level = CONFIDENCE[result.confidenceLevel];

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={`Open nutrition details, ${result.totals.calories} calories, ${
        CONFIDENCE_SPOKEN[result.confidenceLevel]
      }`}
    >
      {/* The number keeps its own colour whatever the parse thought of itself: it is a
          figure, not a warning, and a row of red calories would read as a broken app rather
          than as an uncertain guess. The marker beside it is what carries the doubt, and it
          appears only when there is doubt to carry — a confident row looks like a plain row.

          It sits inside the label's own line, with no line height of its own, or it would
          push the calories off the baseline the writing sits on. See ROW_TEXT_CLASS. */}
      <View className="flex-row items-center gap-1">
        {level.marker !== null ? (
          <Icon name={level.marker} size={14} className={level.className} />
        ) : null}
        <Text className={`${LABEL_CLASS} text-foreground-muted`}>
          {result.totals.calories} <Text className="text-foreground-subtle">cal</Text>
        </Text>
      </View>
    </Pressable>
  );
}
