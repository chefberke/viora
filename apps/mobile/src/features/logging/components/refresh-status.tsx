import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ShimmerText } from '@/shared/ui';
import { useTheme } from '@/theme';

/**
 * The height of the block the word sits in the middle of. It is a constant rather than a
 * measurement, so the block is the right size on the first frame, and it is deeper than
 * the word itself so there is room above and below — the word must not read as part of
 * the greeting above it or of the first meal below.
 */
const BLOCK_HEIGHT = 56;

const REVEAL_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) };

export interface RefreshStatusProps {
  /** True while the day is being fetched again. */
  active: boolean;
}

/**
 * What sits between the greeting and the rows while the day is fetched again: the word
 * "Loading..." with the band running through the letters — the same answer the app gives
 * on the way in, so waiting looks the same wherever it happens.
 *
 * The height is what opens and closes, so the rows below move by one line and the word
 * takes no room at all when it is done. The word itself is only mounted while there is
 * something to say; it stays through the closing so the line does not blank out first.
 */
export function RefreshStatus({ active }: RefreshStatusProps) {
  const { colors } = useTheme();
  const reveal = useSharedValue(0);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (active) {
      setIsMounted(true);
    }

    reveal.value = withTiming(active ? 1 : 0, REVEAL_TIMING, (finished) => {
      if (finished && !active) {
        runOnJS(setIsMounted)(false);
      }
    });
  }, [active, reveal]);

  // Inline, not a className: `Animated.View` takes its styling through `style` here, the
  // same as everywhere else in the app.
  const clipStyle = useAnimatedStyle(() => ({
    height: reveal.value * BLOCK_HEIGHT,
    opacity: reveal.value,
  }));

  return (
    <Animated.View
      style={[{ overflow: 'hidden' }, clipStyle]}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading your entries"
      aria-hidden={!active}
    >
      {/* The block keeps its full height while the clip above opens and closes, so the
          word is centred in it from the first frame instead of drifting into place. */}
      <View className="items-center justify-center" style={{ height: BLOCK_HEIGHT }}>
        {isMounted ? (
          <ShimmerText
            text="Loading..."
            base={colors['foreground-subtle']}
            highlight={colors.foreground}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}
