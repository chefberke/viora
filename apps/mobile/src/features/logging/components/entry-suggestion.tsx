import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { SuggestionDto } from '@/shared/api-types';
import { ShimmerText } from '@/shared/ui';
import { useTheme } from '@/theme';

/** One pass of the shimmer. Shorter than the parse label's, which waits rather than answers. */
const THINK_MS = 520;

/** How a line arrives: a short rise out of nothing, running under the first of the shimmer. */
const ENTER_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };
const ENTER_RISE = 6;

const SUGGESTION_TEXT_CLASS = 'text-base';

function SuggestionLine({
  suggestion,
  animate,
  onSettled,
  onAccept,
}: {
  suggestion: SuggestionDto;
  animate: boolean;
  onSettled: () => void;
  onAccept: (text: string) => void;
}) {
  const { colors } = useTheme();
  const enter = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    enter.value = withTiming(1, ENTER_TIMING);
  }, [enter]);

  // Inline, not classes: `Animated.View` takes its animated styling through `style` here.
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * ENTER_RISE }],
  }));

  return (
    <Pressable
      onPress={() => onAccept(suggestion.text)}
      hitSlop={6}
      accessibilityLabel={`Log "${suggestion.text}"`}
      className="self-start"
    >
      <Animated.View style={enterStyle}>
        {/*
          Base is the full brand purple and the crest is the paler one, which is the way round
          from the parse label. That label never settles — it is replaced — so it can rest dim
          and brighten under the band. A suggestion has to be left in the colour it is tapped
          in, and the band is only passing through.
        */}
        {animate ? (
          <ShimmerText
            text={`✦ ${suggestion.text}`}
            base={colors.brand}
            highlight={colors['brand-soft']}
            textClassName={SUGGESTION_TEXT_CLASS}
            sweepMs={THINK_MS}
            passes={1}
            onSettled={onSettled}
          />
        ) : (
          <Text className={`${SUGGESTION_TEXT_CLASS} text-brand`}>✦ {suggestion.text}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * What to write on an empty row, offered as a short stack of lines.
 *
 * They arrive one at a time, top to bottom, each rising into place and shimmering once before
 * the next appears. The stack is the app thinking out loud, and three lines that materialised
 * together would say the answers had been sitting there all along.
 */
export function EntrySuggestion({
  suggestions,
  onAccept,
}: {
  suggestions: readonly SuggestionDto[];
  onAccept: (text: string) => void;
}) {
  const reduceMotion = useReducedMotion();

  // How many lines have settled. The next one along is the one thinking now, and everything
  // below it has not arrived yet.
  const [settled, setSettled] = useState(0);

  // Restarts only when the offer itself changes. A background refetch that comes back with
  // the same meals leaves the keys alone, so the stack is not replayed under the reader.
  const offer = suggestions.map((suggestion) => suggestion.key).join('\n');

  useEffect(() => {
    setSettled(0);
  }, [offer]);

  const visible = reduceMotion ? suggestions : suggestions.slice(0, settled + 1);

  return (
    <View className="gap-1.5">
      {visible.map((suggestion, index) => (
        <SuggestionLine
          key={suggestion.key}
          suggestion={suggestion}
          animate={!reduceMotion}
          onAccept={onAccept}
          // The next line's own rise is the beat between them, so nothing waits on a timer.
          onSettled={() => setSettled((count) => Math.max(count, index + 1))}
        />
      ))}
    </View>
  );
}
