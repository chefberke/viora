import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/shared/ui';
import { useTheme } from '@/theme';

/** Long enough to read as a change, short enough that a double tap still feels immediate. */
const FILL_MS = 220;

/** The overshoot of the press. It happens on the way in and on the way out, either reads. */
const POP_SCALE = 1.25;
const POP_MS = 120;
const POP_SPRING = { damping: 12, stiffness: 260 };

export interface BookmarkButtonProps {
  isSaved: boolean;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The save button on the nutrition sheet: an empty bookmark that fills.
 *
 * The two states are two glyphs, so there is no colour to animate between — and there could
 * not be one anyway. `Icon` is interopped with `nativeStyleToProp: { color: true }`, which
 * turns its class into a `color` prop and no style object at all, leaving an animated style
 * nothing to drive. So the outline and the filled glyph are stacked and cross-faded instead,
 * each wearing a plain semantic class, with a scale overshoot on the pair to give the tap
 * some weight.
 *
 * Shaped like `IconButton` rather than built on it: that component takes one icon, and this
 * one is two on top of each other.
 */
export function BookmarkButton({ isSaved, onPress, disabled = false }: BookmarkButtonProps) {
  const { shadow } = useTheme();
  const fill = useSharedValue(isSaved ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    fill.value = withTiming(isSaved ? 1 : 0, { duration: FILL_MS });
  }, [isSaved, fill]);

  // Inline, not classes: `Animated.View` takes its styling through `style` here.
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - fill.value }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: fill.value }));

  function handlePress() {
    scale.value = withSequence(
      withTiming(POP_SCALE, { duration: POP_MS }),
      withSpring(1, POP_SPRING),
    );
    onPress();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSaved }}
      accessibilityLabel={isSaved ? 'Remove from saved meals' : 'Save this meal'}
      disabled={disabled}
      onPress={handlePress}
      className="h-12 w-12 items-center justify-center rounded-full bg-surface active:bg-surface-strong"
      style={shadow}
    >
      <Animated.View className="h-[22px] w-[22px] items-center justify-center" style={popStyle}>
        <Animated.View
          className="items-center justify-center"
          style={[StyleSheet.absoluteFill, outlineStyle]}
        >
          <Icon name="bookmark-outline" className="text-foreground-muted" />
        </Animated.View>
        <Animated.View
          className="items-center justify-center"
          style={[StyleSheet.absoluteFill, filledStyle]}
        >
          <Icon name="bookmark" className="text-warning" />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}
