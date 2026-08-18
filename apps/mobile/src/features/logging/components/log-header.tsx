import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Pill } from '@/shared/ui';
import { DayGreeting } from './day-greeting';
import { MonthCalendar } from './month-calendar';
import { SettingsButton } from './settings-button';

/** The gap between the two pills, and the same gap again under them. */
const GAP = 12;

const CALENDAR_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };

export interface LogHeaderProps {
  /** The full name held on the session. Only the first word is shown. */
  name?: string;
  /** When the account was opened. It bounds how far back the calendar can be walked. */
  memberSince?: Date;
}

/**
 * Two pills, not one: the greeting is read, the gear is pressed, so they keep separate
 * surfaces. The row stretches both to a common height, which the greeting sets with its
 * two lines, and the gear pill squares itself against that height so it reads as a circle
 * rather than a narrow capsule; its own padding is only the floor, in case the greeting
 * ever shrinks to one line. The greeting takes the width that is left.
 *
 * The greeting is also the handle for the month: pressing it drops the calendar out from
 * under the row, in the greeting's own width — the gear's measured width is what the card
 * keeps clear on the right.
 *
 * The calendar stays a child of the header rather than floating over the screen, because
 * Android delivers no touch to anything drawn outside its parent and the month arrows are
 * pressed. So the header grows with it and hands the same height straight back as a
 * negative margin: the screen below is covered, never moved.
 */
export function LogHeader({ name, memberSince }: LogHeaderProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarHeight, setCalendarHeight] = useState(0);
  const [gearWidth, setGearWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isCalendarOpen ? 1 : 0, CALENDAR_TIMING);
  }, [isCalendarOpen, progress]);

  const headerStyle = useAnimatedStyle(() => ({
    marginBottom: -progress.value * calendarHeight,
  }));

  // The height is what animates, so the card unrolls from its top edge under the pills.
  const panelStyle = useAnimatedStyle(() => ({
    height: progress.value * calendarHeight,
    opacity: progress.value,
  }));

  return (
    // `box-none` everywhere the header only holds space: the composer underneath still
    // takes the taps that land beside the calendar.
    <Animated.View style={[{ zIndex: 10 }, headerStyle]} pointerEvents="box-none">
      <View className="flex-row items-stretch px-5 pt-3" style={{ gap: GAP }}>
        <Pill
          className="flex-1 px-5 py-3"
          onPress={() => setIsCalendarOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Show the month"
          accessibilityState={{ expanded: isCalendarOpen }}
        >
          <DayGreeting name={name} />
        </Pill>

        <Pill
          className="aspect-square justify-center px-5"
          onLayout={({ nativeEvent }) => setGearWidth(nativeEvent.layout.width)}
        >
          <SettingsButton />
        </Pill>
      </View>

      <Animated.View
        style={[{ overflow: 'hidden' }, panelStyle]}
        pointerEvents={isCalendarOpen ? 'box-none' : 'none'}
        aria-hidden={!isCalendarOpen}
      >
        {/* The padding is the gap to the pills plus the room the card's shadow needs; the
            clip above cuts anything that reaches past it. */}
        <View
          className="px-5 pb-4"
          style={{ paddingTop: GAP, marginRight: gearWidth + GAP }}
          pointerEvents="box-none"
          onLayout={({ nativeEvent }) => setCalendarHeight(nativeEvent.layout.height)}
        >
          <MonthCalendar memberSince={memberSince} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}
