import { useEffect, useRef } from 'react';
import { Animated, Easing, type DimensionValue } from 'react-native';

import { useTheme } from '@/theme';

/** How long the placeholder takes to fade one way, in milliseconds. */
const PULSE_DURATION = 800;

const RESTING_OPACITY = 0.45;

/**
 * The breath every bar in one skeleton shares. It is a single animation handed to all of
 * them rather than one each, so the whole placeholder rises and falls together instead of
 * shimmering out of step.
 */
export function useSkeletonPulse(): Animated.AnimatedInterpolation<number> {
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

  return pulse.interpolate({ inputRange: [0, 1], outputRange: [RESTING_OPACITY, 1] });
}

export interface SkeletonBarProps {
  /** A number of points, or a share of the room the bar sits in. */
  width: DimensionValue;
  height?: number;
  /** The breath from `useSkeletonPulse`, shared with the other bars beside it. */
  opacity: Animated.AnimatedInterpolation<number>;
}

/** One grey bar standing in for a line of text. */
export function SkeletonBar({ width, height = 13, opacity }: SkeletonBarProps) {
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
