import { Pressable, Text } from 'react-native';

import { ROW_TEXT_CLASS, WATER_GLYPH } from '../constants';
import type { RowState } from '../use-entry-parser';
import { ParsePhaseLabel } from './parse-phase-label';

// The row's own type, so the label starts on the same line as the writing. See constants.ts.
const LABEL_CLASS = ROW_TEXT_CLASS;

/**
 * The right edge of a composer row: shimmering phase words while the parse runs, the
 * outcome once it lands — calories for food, blue millilitres for water — and a retry
 * affordance when the pipeline failed.
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

  if (state.phase === 'error') {
    return (
      <Pressable onPress={onRetry} hitSlop={8} accessibilityLabel="Retry parsing this entry">
        <Text className={`${LABEL_CLASS} text-danger`}>Retry</Text>
      </Pressable>
    );
  }

  const result = state.result;

  if (!result) {
    return null;
  }

  // The parser read the line and found no food in it.
  if (result.items.length === 0) {
    return <Text className={`${LABEL_CLASS} text-foreground-subtle`}>—</Text>;
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

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel="Open nutrition details">
      <Text className={`${LABEL_CLASS} text-foreground-muted`}>
        {result.totals.calories} <Text className="text-foreground-subtle">cal</Text>
      </Text>
    </Pressable>
  );
}
