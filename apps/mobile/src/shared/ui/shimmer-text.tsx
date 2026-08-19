import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/** How long one pass of the highlight takes, in milliseconds. */
const SWEEP_DURATION = 1100;

/**
 * Width of the moving band, as a multiple of the text width. Under 1 on purpose: a band
 * wider than the word spreads the highlight into a slow wash, and it also lengthens the
 * travel the band has to make off both edges, so the bright part is off the word for most
 * of the pass. A short band arrives, reads, and leaves.
 */
const SWEEP_WIDTH = 0.9;

/**
 * Where the band turns bright. It holds the full highlight across the middle rather than
 * touching it at a single point, so the pass reaches its colour instead of only aiming at it.
 */
const SWEEP_STOPS = [0, 0.42, 0.58, 1] as const;

/**
 * How a new word takes the place of the one before it, in milliseconds. Short on purpose,
 * and shorter on the way out than on the way in: the old word is gone almost at once,
 * which is what makes the change read as quick, while the new one still arrives softly
 * instead of snapping into place.
 */
const SWAP_OUT_DURATION = 110;
const SWAP_IN_DURATION = 170;

/** How far a word sits below its place while it is out, in points. */
const SWAP_SHIFT = 5;

export interface ShimmerTextProps {
  text: string;
  /** The resting colour of the letters. */
  base: string;
  /** The colour at the centre of the travelling band. */
  highlight: string;
  /** Size and weight of the text. Colour comes from `base`/`highlight`. */
  textClassName?: string;
  /** How long one pass takes. The default suits a wait; a shorter one suits a flourish. */
  sweepMs?: number;
  /**
   * How many times the band crosses the text. Left out, it crosses for as long as the
   * component is mounted — which is what a wait of unknown length needs. A number instead
   * makes the shimmer a moment rather than a state: the band leaves at the far edge and the
   * letters are simply `base` from then on, so the settled look needs no second element.
   */
  passes?: number;
  /** Called once the last pass has left the text. Never called while the band is looping. */
  onSettled?: () => void;
}

/**
 * `MaskedView` clips the layers below to the shape of the glyphs, so the band only shows
 * inside the letters. The gradient ends on `base` rather than on transparent: a
 * transparent stop interpolates through transparent black and leaves a dark fringe.
 */
export function ShimmerText({
  text,
  base,
  highlight,
  textClassName = 'text-[15px] font-normal',
  sweepMs = SWEEP_DURATION,
  passes,
  onSettled,
}: ShimmerTextProps) {
  const progress = useRef(new Animated.Value(0)).current;
  // The band travels the real width of the text, which is only known after one layout.
  const [width, setWidth] = useState(0);

  // What is on screen, which trails `text` by the length of one swap.
  const [shown, setShown] = useState(text);
  // 1 while a word is settled, 0 while it is out of the way.
  const swap = useRef(new Animated.Value(1)).current;

  // Held in a ref so a fresh inline callback on every parent render cannot restart the sweep.
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    // On the UI thread, so the sweep does not stutter while JavaScript is busy.
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: sweepMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      passes === undefined ? undefined : { iterations: passes },
    );

    // Only a counted sweep ever finishes, so this fires for those and never for the loop.
    loop.start(({ finished }) => {
      if (finished) {
        settled.current?.();
      }
    });

    return () => loop.stop();
  }, [passes, progress, sweepMs]);

  // A new word waits for the old one to leave: one line, so the width may change under it.
  useEffect(() => {
    if (text === shown) {
      return;
    }

    const out = Animated.timing(swap, {
      toValue: 0,
      duration: SWAP_OUT_DURATION,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    out.start(({ finished }) => {
      if (finished) {
        setShown(text);
      }
    });

    return () => out.stop();
  }, [text, shown, swap]);

  // And comes back up in its place. On the first render this settles what is already settled.
  useEffect(() => {
    const enter = Animated.timing(swap, {
      toValue: 1,
      duration: SWAP_IN_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    enter.start();
    return () => enter.stop();
  }, [shown, swap]);

  const bandWidth = width * SWEEP_WIDTH;

  const swapShift = swap.interpolate({
    inputRange: [0, 1],
    outputRange: [SWAP_SHIFT, 0],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    // Off both edges, so the highlight never appears mid-word.
    outputRange: [-bandWidth, width + bandWidth],
  });

  return (
    <Animated.View style={{ opacity: swap, transform: [{ translateY: swapShift }] }}>
      <MaskedView
        maskElement={
          // The mask reads alpha, not colour; this only has to be opaque.
          <Text className={textClassName} style={{ color: '#000000' }}>
            {shown}
          </Text>
        }
      >
        {/* Invisible, and the only child with a size: it is what measures the masked view. */}
        <Text
          className={textClassName}
          style={{ opacity: 0 }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {shown}
        </Text>

        <View style={[StyleSheet.absoluteFill, { backgroundColor: base }]} />

        <Animated.View
          style={[StyleSheet.absoluteFill, { width: bandWidth, transform: [{ translateX }] }]}
        >
          <LinearGradient
            colors={[base, highlight, highlight, base]}
            locations={SWEEP_STOPS}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </MaskedView>
    </Animated.View>
  );
}
