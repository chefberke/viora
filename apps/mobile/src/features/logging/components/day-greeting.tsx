import { Text, View } from 'react-native';

import { Icon, Pill } from '@/shared/ui';
import { GREETINGS } from '../constants';
import { formatDateLabel, formatDaysAgo, formatGreeting, getTimeOfDay } from '../greeting';

export interface DayGreetingProps {
  /** The full name held on the session. Only the first word is shown. */
  name?: string;
  /** The day on screen, which is not always today. */
  date: Date;
  isToday: boolean;
  /** How many days back `date` sits. Zero on today. */
  daysBack: number;
  /** Opens the month. The date chip is the handle, not the whole block. */
  onPressDate: () => void;
}

/**
 * The two things that open the day, stacked and centred: who is logging, and which day it
 * is.
 *
 * Only the day carries a surface. The greeting is a line to read, so it sits on the page
 * with nothing under it; the date is a control, so it is the chip — and pressing a date to
 * change the date says what it does without a word of label. The chip is sized to what it
 * holds rather than to the screen, so the row reads as two centred things and not as a bar.
 *
 * A past day is not greeted. "Good morning" on a Monday that ended three days ago would be
 * a greeting to nobody, so how far back the day sits takes the top line instead — the same
 * two lines, saying what is true of that day.
 */
export function DayGreeting({ name, date, isToday, daysBack, onPressDate }: DayGreetingProps) {
  const timeOfDay = getTimeOfDay(date);
  const { icon, colorClassName } = GREETINGS[timeOfDay];

  return (
    <View className="items-center">
      {/* Kept clear of the gear on the right, so a long name is cut rather than run under it. */}
      <Text
        className="px-12 text-center text-[17px] font-semibold text-foreground-soft"
        numberOfLines={1}
      >
        {isToday ? formatGreeting(timeOfDay, name) : formatDaysAgo(daysBack)}
      </Text>

      <Pill
        className="mt-2 gap-1.5 px-4 py-1.5"
        onPress={onPressDate}
        accessibilityRole="button"
        accessibilityLabel="Show the month"
      >
        {/* The sun or the moon says what the greeting says, in one glyph. A past day is
            told by the clock face instead: the time of day it was is nothing to say. */}
        <Icon
          name={isToday ? icon : 'time'}
          size={13}
          className={isToday ? colorClassName : 'text-foreground-subtle'}
        />

        <Text className="text-[13px] font-medium text-foreground-muted">
          {formatDateLabel(date)}
        </Text>
      </Pill>
    </View>
  );
}
