import { ShimmerText } from '@/shared/ui';
import { useTheme } from '@/theme';
import { ROW_TEXT_CLASS } from '../constants';
import { useParseWord } from '../use-parse-word';

/**
 * The right edge of a row while its parse runs: one shimmering word at a time, swapped for
 * the next every so often. `ShimmerText` carries the swap itself, so the sweep keeps
 * running across the change and the row never goes quiet between words.
 */
export function ParsePhaseLabel({ phase }: { phase: 'reading' | 'calculating' }) {
  const { colors } = useTheme();
  const word = useParseWord(phase);

  return (
    <ShimmerText
      text={word}
      base={colors['foreground-muted']}
      highlight={colors.foreground}
      textClassName={ROW_TEXT_CLASS}
    />
  );
}
