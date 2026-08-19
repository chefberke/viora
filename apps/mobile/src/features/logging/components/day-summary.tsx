import { useState } from 'react';
import { View } from 'react-native';

import type { MacroTotals } from '../types';
import { DaySummaryBar } from './day-summary-bar';
import { DaySummaryPanel } from './day-summary-panel';

export interface DaySummaryProps {
  totals: MacroTotals;
  waterMl: number;
}

/**
 * The bottom of the idle screen: the summary bar, and the day it opens out into. The two
 * are one control, so the open state lives here rather than on the screen — nothing above
 * needs to know whether the day is being read in full.
 *
 * The panel is given the bar's measured width, the way the month card upstairs takes the
 * width of the greeting it drops out of. The bar sets how wide the two of them are, and
 * it is the one with numbers that grow.
 */
export function DaySummary({ totals, waterMl }: DaySummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  return (
    <View>
      <DaySummaryPanel totals={totals} waterMl={waterMl} isOpen={isOpen} width={barWidth} />

      <DaySummaryBar
        calories={totals.calories}
        waterMl={waterMl}
        isOpen={isOpen}
        onPress={() => setIsOpen((open) => !open)}
        onLayout={({ nativeEvent }) => setBarWidth(nativeEvent.layout.width)}
      />
    </View>
  );
}
