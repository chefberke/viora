import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, Keyboard, PanResponder, useWindowDimensions } from 'react-native';

/** How far the finger must travel sideways before the swipe takes the touch from the rows. */
const CLAIM_DISTANCE = 16;

/** How much more sideways than up-and-down that travel must be. */
const CLAIM_RATIO = 1.6;

/** How far the day must be dragged for the step to be taken rather than sprung back. */
const COMMIT_DISTANCE = 72;

/** How much of the drag a closed direction gives, so it answers without opening. */
const RESISTANCE = 0.22;

const EXIT_MS = 140;
const ENTER_MS = 200;
const SPRING_BACK_MS = 180;

export interface DaySwipeProps {
  children: ReactNode;
  /** True while there is an older day to step back to. */
  canGoBack: boolean;
  /** True while the day on screen is not today. */
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

/**
 * The days as a deck the log is dragged across: pulling right brings the older day in
 * from the left, pulling left goes forward towards today. A direction with no day behind
 * it still moves, but only a little and it springs straight back — a closed way that does
 * not move at all reads as a screen that has stopped responding.
 *
 * The touch is taken in the capture phase, before the rows below see it, but only once
 * the finger is clearly going sideways. Everything else — a tap into a row, a scroll, the
 * pull that refreshes — is up and down or barely moves, so it never reaches this.
 */
export function DaySwipe({ children, canGoBack, canGoForward, onBack, onForward }: DaySwipeProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const widthRef = useRef(width);

  widthRef.current = width;

  // The responder is built once, so it reads the moving parts through a ref rather than
  // closing over the values this render happened to have.
  const latest = useRef({ canGoBack, canGoForward, onBack, onForward });

  latest.current = { canGoBack, canGoForward, onBack, onForward };

  const responder = useMemo(() => {
    function isAllowed(direction: number): boolean {
      return direction > 0 ? latest.current.canGoBack : latest.current.canGoForward;
    }

    function springBack() {
      Animated.timing(translateX, {
        toValue: 0,
        duration: SPRING_BACK_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }

    function commit(direction: number) {
      // The day underneath is about to be replaced, so the row being written on is left.
      Keyboard.dismiss();

      Animated.timing(translateX, {
        toValue: direction * widthRef.current,
        duration: EXIT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          return;
        }

        if (direction > 0) {
          latest.current.onBack();
        } else {
          latest.current.onForward();
        }

        // The day that arrives comes from the side it lives on: the older one from the
        // left, the newer one from the right.
        translateX.setValue(-direction * widthRef.current);

        Animated.timing(translateX, {
          toValue: 0,
          duration: ENTER_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }

    return PanResponder.create({
      // A press must still reach the row it landed on, so only movement is watched.
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Math.abs(gesture.dx) > CLAIM_DISTANCE &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * CLAIM_RATIO,
      onPanResponderMove: (_event, gesture) => {
        const direction = gesture.dx > 0 ? 1 : -1;

        translateX.setValue(isAllowed(direction) ? gesture.dx : gesture.dx * RESISTANCE);
      },
      onPanResponderRelease: (_event, gesture) => {
        const direction = gesture.dx > 0 ? 1 : -1;

        if (isAllowed(direction) && Math.abs(gesture.dx) > COMMIT_DISTANCE) {
          commit(direction);
          return;
        }

        springBack();
      },
      onPanResponderTerminate: springBack,
    });
  }, [translateX]);

  // The day fades as it leaves and comes back up as the next one arrives, so the two are
  // never read as the same day sliding about.
  const opacity = translateX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0, 1, 0],
  });

  return (
    <Animated.View
      style={{ flex: 1, transform: [{ translateX }], opacity }}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}
