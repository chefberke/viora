import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** How long one pass of the highlight takes, in milliseconds. */
const SWEEP_DURATION = 1600;

/** Width of the moving band, as a multiple of the text width. */
const SWEEP_WIDTH = 1.5;

const TEXT_CLASS = 'text-[15px] font-normal';

export interface LoadingScreenProps {
  /** What is being waited for. Written as a sentence, not a bare "Loading". */
  message?: string;
}

/** A full-screen hold. The message itself shimmers instead of a spinner. */
export function LoadingScreen({ message = 'Loading your profile...' }: LoadingScreenProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <ShimmerText text={message} base={colors['foreground-subtle']} highlight={colors.foreground} />
    </View>
  );
}

interface ShimmerTextProps {
  text: string;
  /** The resting colour of the letters. */
  base: string;
  /** The colour at the centre of the travelling band. */
  highlight: string;
}

/**
 * `MaskedView` clips the layers below to the shape of the glyphs, so the band only shows
 * inside the letters. The gradient ends on `base` rather than on transparent: a
 * transparent stop interpolates through transparent black and leaves a dark fringe.
 */
function ShimmerText({ text, base, highlight }: ShimmerTextProps) {
  const progress = useRef(new Animated.Value(0)).current;
  // The band travels the real width of the text, which is only known after one layout.
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // On the UI thread, so the sweep does not stutter while JavaScript is busy.
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SWEEP_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => loop.stop();
  }, [progress]);

  const bandWidth = width * SWEEP_WIDTH;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    // Off both edges, so the highlight never appears mid-word.
    outputRange: [-bandWidth, width + bandWidth],
  });

  return (
    <MaskedView
      maskElement={
        // The mask reads alpha, not colour; this only has to be opaque.
        <Text className={TEXT_CLASS} style={{ color: '#000000' }}>
          {text}
        </Text>
      }
    >
      {/* Invisible, and the only child with a size: it is what measures the masked view. */}
      <Text className={TEXT_CLASS} style={{ opacity: 0 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {text}
      </Text>

      <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />

      <Animated.View
        style={[StyleSheet.absoluteFill, { width: bandWidth, transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={[base, highlight, base]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </MaskedView>
  );
}
