import { View } from 'react-native';

import { DateChip } from './date-chip';
import { StreakBadge } from './streak-badge';

export interface LogHeaderProps {
  dateLabel: string;
  streak: number;
}

/**
 * Three columns so the date chip stays centred whatever the streak badge grows to. The
 * empty left one is reserved for the logo.
 */
export function LogHeader({ dateLabel, streak }: LogHeaderProps) {
  return (
    <View className="flex-row items-center px-5 py-2">
      <View className="flex-1" />

      <DateChip label={dateLabel} />

      <View className="flex-1 items-end">
        <StreakBadge streak={streak} />
      </View>
    </View>
  );
}
