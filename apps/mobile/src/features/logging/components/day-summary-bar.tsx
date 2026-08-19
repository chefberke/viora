import { Text, type ViewProps } from 'react-native';

import { Pill } from '@/shared/ui';
import { CalorieStat } from './calorie-stat';
import { WaterStat } from './water-stat';

export interface DaySummaryBarProps {
  calories: number;
  waterMl: number;
  /** True while the day panel above it is open. */
  isOpen: boolean;
  onPress: () => void;
  /** The panel above takes its width from this bar, so its measurement is handed up. */
  onLayout?: ViewProps['onLayout'];
}

/**
 * The floating pill at the bottom of the idle screen: 🔥 0 · 💧 0 ml, and the handle for
 * the day panel. It carries the two numbers a day is watched by, and leaves the macro
 * split to the panel it opens out into — three more letters on the pill read as a row of
 * figures rather than as the day so far.
 */
export function DaySummaryBar({
  calories,
  waterMl,
  isOpen,
  onPress,
  onLayout,
}: DaySummaryBarProps) {
  return (
    <Pill
      className="self-center justify-center gap-3 px-8 py-4"
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel="Show the day in full"
      accessibilityState={{ expanded: isOpen }}
    >
      <CalorieStat value={calories} />
      <Text className="text-base text-foreground-subtle">·</Text>
      <WaterStat value={waterMl} />
    </Pill>
  );
}
