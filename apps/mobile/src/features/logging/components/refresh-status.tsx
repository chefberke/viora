import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon, ShimmerText, type IoniconName } from '@/shared/ui';
import { useTheme } from '@/theme';

/**
 * The height of the block the word sits in the middle of. It is a constant rather than a
 * measurement, so the block is the right size on the first frame, and it is deeper than
 * the word itself so there is room above and below — the word must not read as part of
 * the greeting above it or of the first meal below.
 */
const BLOCK_HEIGHT = 56;

const REVEAL_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) };

/**
 * What the band has to say, or nothing.
 *
 * One band and not two. Both messages want the same 56 pixels between the greeting and the
 * first row, and stacking a second animated block there would mean two heights opening
 * against each other and the rows below moving twice.
 *
 * `offline` outranks the other two: a fetch with no connection is not going to finish, and
 * both "Loading..." and "could not be loaded" would be told on top of the reason for both.
 * `refreshing` in turn outranks `failed`, so pulling on a day that failed shows the attempt
 * rather than going on repeating the last result while it is being retried.
 */
export type RefreshState = 'idle' | 'refreshing' | 'offline' | 'failed';

export interface RefreshStatusProps {
  state: RefreshState;
}

/**
 * The two states that are a sentence rather than a shimmer. `refreshing` is absent on
 * purpose — waiting has no words worth reading, which is why it is the animation.
 */
const MESSAGES: Partial<Record<RefreshState, { icon: IoniconName; text: string; spoken: string }>> =
  {
    offline: {
      icon: 'cloud-offline-outline',
      text: 'Offline — entries will send when you are back',
      spoken: 'No connection. Entries will be sent when you are back online.',
    },
    failed: {
      icon: 'alert-circle-outline',
      // Says what is missing and what to do. Without it a day that failed to load renders
      // as a day with nothing in it, which invites retyping a breakfast already logged.
      text: 'Could not load this day — pull to try again',
      spoken: 'This day could not be loaded. Pull down to try again.',
    },
  };

/**
 * What sits between the greeting and the rows when there is something to say: "Loading..."
 * with the band running through the letters while the day is fetched again — the same
 * answer the app gives on the way in, so waiting looks the same wherever it happens — or
 * one of the sentences in `MESSAGES`, when the reason nothing is arriving is worth words.
 *
 * The height is what opens and closes, so the rows below move by one line and the word
 * takes no room at all when it is done. The word itself is only mounted while there is
 * something to say; it stays through the closing so the line does not blank out first.
 */
export function RefreshStatus({ state }: RefreshStatusProps) {
  const { colors } = useTheme();
  const reveal = useSharedValue(0);
  const [isMounted, setIsMounted] = useState(false);
  const active = state !== 'idle';

  // Held through the close so the words do not blank out before the height does. Without
  // it, switching from offline to refreshing would also flicker through an empty band.
  const [shown, setShown] = useState<RefreshState>(state);

  const message = MESSAGES[shown];

  useEffect(() => {
    if (active) {
      setIsMounted(true);
      setShown(state);
    }

    reveal.value = withTiming(active ? 1 : 0, REVEAL_TIMING, (finished) => {
      if (finished && !active) {
        runOnJS(setIsMounted)(false);
      }
    });
  }, [active, state, reveal]);

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
      accessibilityRole={shown === 'refreshing' ? 'progressbar' : 'alert'}
      accessibilityLabel={message?.spoken ?? 'Loading your entries'}
      aria-hidden={!active}
    >
      {/* The block keeps its full height while the clip above opens and closes, so the
          word is centred in it from the first frame instead of drifting into place. */}
      <View className="items-center justify-center" style={{ height: BLOCK_HEIGHT }}>
        {isMounted && message !== undefined ? (
          <View className="flex-row items-center gap-2">
            <Icon name={message.icon} size={16} className="text-foreground-muted" />
            <Text className="text-[15px] text-foreground-muted">{message.text}</Text>
          </View>
        ) : null}

        {isMounted && message === undefined ? (
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
