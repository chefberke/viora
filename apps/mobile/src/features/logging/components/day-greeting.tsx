import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui';
import { GREETINGS } from '../constants';
import { formatDateLabel, formatGreeting, getTimeOfDay } from '../greeting';
import { useToday } from '../use-today';

export interface DayGreetingProps {
  /** The full name held on the session. Only the first word is shown. */
  name?: string;
}

/** The two lines that open the day: who is logging, and which day it is. */
export function DayGreeting({ name }: DayGreetingProps) {
  const today = useToday();
  const timeOfDay = getTimeOfDay(today);
  const { icon, colorClassName } = GREETINGS[timeOfDay];

  return (
    // Fills the pill, so a long name truncates instead of widening the row.
    <View className="flex-1">
      <Text className="text-[17px] font-semibold text-foreground" numberOfLines={1}>
        {formatGreeting(timeOfDay, name)}
      </Text>

      <View className="mt-0.5 flex-row items-center gap-1.5">
        {/* The sun or the moon says what the greeting says, in one glyph. */}
        <Icon name={icon} size={13} className={colorClassName} />

        <Text className="text-[13px] text-foreground-muted" numberOfLines={1}>
          It's {formatDateLabel(today)}
        </Text>
      </View>
    </View>
  );
}
