import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/shared/ui';
import { fromDayNumber, toDayNumber } from '../calendar';
import { CALORIE_GLYPH, MACROS, WATER_GLYPH } from '@/shared/macros';
import { formatDateLabel } from '../greeting';
import { useDayTotals } from '../use-day-totals';
import { useToday } from '../use-today';

export interface DaySummarySheetScreenProps {
  /** The day the bar was pressed on. Today when the route carried none. */
  day?: number;
}

/**
 * The day read out in full: the two numbers from the bar said again, and the split the bar
 * has no room for — how the day's calories divide between the three macros, by the Atwater
 * factors. No goal is drawn, because the app has none to draw yet.
 *
 * The date is at the top because the sheet covers the header that would otherwise say it.
 *
 * Nothing here draws a card. The sheet is the surface, and a card on a surface with nothing
 * behind it reads as a layer that is not there.
 *
 * A plain `View`, never `flex-1` — the sheet is sized to its contents.
 */
export function DaySummarySheetScreen({ day }: DaySummarySheetScreenProps) {
  const insets = useSafeAreaInsets();
  const today = useToday();
  const todayDay = toDayNumber(today);
  const shown = day ?? todayDay;

  const { totals, waterMl } = useDayTotals(shown);

  const macroKcal = MACROS.map((macro) => totals[macro.key] * macro.kcalPerGram);
  const totalKcal = macroKcal.reduce((sum, value) => sum + value, 0);

  return (
    <View className="gap-5 px-5 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
      <SheetHeader title={shown === todayDay ? 'Today' : formatDateLabel(fromDayNumber(shown))} />

      <View className="flex-row items-end justify-between">
        <View className="gap-0.5">
          <Text className="text-[13px] text-foreground-muted">Calories</Text>
          <Text className="text-3xl font-bold text-foreground-soft">
            {CALORIE_GLYPH} {totals.calories}
          </Text>
        </View>

        <View className="items-end gap-0.5">
          <Text className="text-[13px] text-foreground-muted">Water</Text>
          <Text className="text-xl font-semibold text-water">
            {WATER_GLYPH} {waterMl} ml
          </Text>
        </View>
      </View>

      <View className="gap-3">
        {MACROS.map((macro, index) => (
          <MacroShare
            key={macro.key}
            name={macro.name}
            grams={totals[macro.key]}
            // A day with nothing on it splits into nothing rather than into thirds.
            share={totalKcal === 0 ? 0 : (macroKcal[index] ?? 0) / totalKcal}
            colorClassName={macro.colorClassName}
            fillClassName={macro.fillClassName}
          />
        ))}
      </View>
    </View>
  );
}

/** One macro: what it weighs, and how much of the day's calories it accounts for. */
function MacroShare({
  name,
  grams,
  share,
  colorClassName,
  fillClassName,
}: {
  name: string;
  grams: number;
  /** Its part of the day, from 0 to 1. */
  share: number;
  colorClassName: string;
  fillClassName: string;
}) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className={`text-sm font-semibold ${colorClassName}`}>{name}</Text>

        <Text className="text-sm text-foreground-muted">
          <Text className="font-semibold text-foreground">{grams} g</Text>
          {'  '}
          {Math.round(share * 100)}%
        </Text>
      </View>

      <View className="h-1.5 overflow-hidden rounded-full bg-background">
        <View
          className={`h-full rounded-full ${fillClassName}`}
          style={{ width: `${share * 100}%` }}
        />
      </View>
    </View>
  );
}
