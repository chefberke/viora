import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui';
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
}

/**
 * The two lines that open the day: who is logging, and which day it is.
 *
 * A past day is not greeted. "Good morning" on a Monday that ended three days ago would
 * be a greeting to nobody, so the day itself takes the top line and how far back it sits
 * takes the second — the same two lines, saying what is true of that day instead.
 */
export function DayGreeting({ name, date, isToday, daysBack }: DayGreetingProps) {
  const timeOfDay = getTimeOfDay(date);
  const { icon, colorClassName } = GREETINGS[timeOfDay];

  return (
    // Fills the pill, so a long name truncates instead of widening the row.
    <View className="flex-1">
      <Text className="text-[17px] font-semibold text-foreground" numberOfLines={1}>
        {isToday ? formatGreeting(timeOfDay, name) : formatDateLabel(date)}
      </Text>

      <View className="mt-0.5 flex-row items-center gap-1.5">
        {/* The sun or the moon says what the greeting says, in one glyph. A past day is
            told by the clock face instead: the time of day it was is nothing to say. */}
        <Icon
          name={isToday ? icon : 'time'}
          size={13}
          className={isToday ? colorClassName : 'text-foreground-subtle'}
        />

        <Text className="text-[13px] text-foreground-muted" numberOfLines={1}>
          {isToday ? `It's ${formatDateLabel(date)}` : formatDaysAgo(daysBack)}
        </Text>
      </View>
    </View>
  );
}
