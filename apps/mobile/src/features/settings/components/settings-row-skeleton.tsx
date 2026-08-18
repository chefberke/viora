import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

import { useTheme } from '@/theme';

/** How long the placeholder takes to fade one way, in milliseconds. */
const PULSE_DURATION = 800;

const RESTING_OPACITY = 0.45;

export interface SettingsRowSkeletonProps {
  /** Leaves room for the leading glyph, for a row that will have one. */
  icon?: boolean;
  /** Draws the right-hand bar, for a row that will carry a value there. */
  value?: boolean;
}

/**
 * A row that is still being answered by the server. It holds the height and the shape of
 * the real row, so nothing on the card moves when the answer lands.
 */
export function SettingsRowSkeleton({ icon = false, value = false }: SettingsRowSkeletonProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // On the UI thread, so the breath holds while JavaScript is busy with the request.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_DURATION,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [RESTING_OPACITY, 1] });

  return (
    // Nothing here is readable, so it is kept out of the accessibility tree.
    <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3" aria-hidden>
      {icon ? <Bar width={20} height={20} opacity={opacity} /> : null}
      <Bar width={icon ? 132 : 60} opacity={opacity} />

      <View className="flex-1" />

      {value ? <Bar width={92} opacity={opacity} /> : null}
    </View>
  );
}

interface BarProps {
  width: number;
  height?: number;
  opacity: Animated.AnimatedInterpolation<number>;
}

/** One grey bar standing in for a line of text. */
function Bar({ width, height = 13, opacity }: BarProps) {
  const { colors } = useTheme();

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: colors['surface-strong'],
        opacity,
      }}
    />
  );
}
