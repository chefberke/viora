import { Text } from 'react-native';

import { Pill } from '@/shared/ui';
import { CalorieStat } from './calorie-stat';
import { WaterStat } from './water-stat';

export interface DaySummaryBarProps {
  calories: number;
  waterMl: number;
  onPress: () => void;
}

/**
 * The floating pill at the bottom of the idle screen: 🔥 0 · 💧 0 ml, and the handle for
 * the day sheet. It carries the two numbers a day is watched by, and leaves the macro
 * split to the sheet it opens — three more letters on the pill read as a row of figures
 * rather than as the day so far.
 */
export function DaySummaryBar({ calories, waterMl, onPress }: DaySummaryBarProps) {
  return (
    <Pill
      className="self-center justify-center gap-3 px-8 py-4"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Show the day in full"
    >
      <CalorieStat value={calories} />
      <Text className="text-base text-foreground-subtle">·</Text>
      <WaterStat value={waterMl} />
    </Pill>
  );
}
