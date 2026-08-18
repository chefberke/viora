import { Fragment } from 'react';
import { Text, View } from 'react-native';

import { Pill } from '@/shared/ui';
import { MACROS } from '../constants';
import type { MacroTotals } from '../types';
import { CalorieStat } from './calorie-stat';
import { MacroStat } from './macro-stat';

/** The floating pill at the bottom of the idle screen: 🔥 0 · C 0 · P 0 · F 0 */
export function MacroSummaryBar({ totals }: { totals: MacroTotals }) {
  return (
    <Pill className="self-center justify-center gap-3 px-8 py-4">
      <CalorieStat value={totals.calories} />

      {MACROS.map((macro) => (
        <Fragment key={macro.key}>
          <Text className="text-base text-foreground-subtle">·</Text>
          <MacroStat
            label={macro.label}
            value={totals[macro.key]}
            labelClassName={macro.colorClassName}
          />
        </Fragment>
      ))}
    </Pill>
  );
}
