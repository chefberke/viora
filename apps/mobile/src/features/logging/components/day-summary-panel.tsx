import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { CALORIE_GLYPH, MACROS, PANEL_OVERHANG, WATER_GLYPH } from '../constants';
import type { MacroTotals } from '../types';

const PANEL_TIMING = { duration: 240, easing: Easing.out(Easing.cubic) };

/** The gap between the card and the bar it opens out of. */
const GAP = 12;

export interface DaySummaryPanelProps {
  totals: MacroTotals;
  waterMl: number;
  isOpen: boolean;
  /** The measured width of the bar below. Zero until the bar has been laid out once. */
  width: number;
}

/**
 * The day read out in full, unrolling upward from the summary bar.
 *
 * The card is pinned to the bottom of the clip rather than the top, so it slides out from
 * behind the bar with its lines already in place instead of the text walking upward as
 * the card grows. The height is what animates, so the rows above only lose the room the
 * card takes and nothing on the screen jumps.
 *
 * It is drawn to the bar's own width plus a few points on each side, the way the month
 * card upstairs is drawn to the greeting it drops out of: near enough to read as the one
 * control, wide enough to read as a card that came out of the pill.
 *
 * What it adds to the bar is the split: how the day's calories divide between the three
 * macros, by the Atwater factors. The bar's two numbers are said again at the top of it,
 * so the card reads on its own. No goal is drawn on it, because the app has none to draw
 * yet.
 */
export function DaySummaryPanel({ totals, waterMl, isOpen, width }: DaySummaryPanelProps) {
  const { shadow } = useTheme();
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, PANEL_TIMING);
  }, [isOpen, progress]);

  const clipStyle = useAnimatedStyle(() => ({
    height: progress.value * height,
    opacity: progress.value,
  }));

  const macroKcal = MACROS.map((macro) => totals[macro.key] * macro.kcalPerGram);
  const totalKcal = macroKcal.reduce((sum, value) => sum + value, 0);

  return (
    <Animated.View
      // Inline, not classes: `Animated.View` takes its styling through `style` here.
      style={[
        {
          overflow: 'hidden',
          alignSelf: 'center',
          width: width > 0 ? width + PANEL_OVERHANG * 2 : undefined,
          maxWidth: '100%',
        },
        clipStyle,
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
      aria-hidden={!isOpen}
    >
      {/* Held to the bottom of the clip, which is the edge that stays still. */}
      <View
        className="absolute bottom-0 left-0 right-0"
        style={{ paddingBottom: GAP }}
        onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      >
        <View className="gap-4 rounded-[28px] bg-surface p-5" style={shadow}>
          <View className="flex-row items-end justify-between">
            <View className="gap-0.5">
              <Text className="text-[13px] text-foreground-muted">Calories</Text>
              <Text className="text-3xl font-bold text-foreground">
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
      </View>
    </Animated.View>
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

      <View className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
        <View
          className={`h-full rounded-full ${fillClassName}`}
          style={{ width: `${share * 100}%` }}
        />
      </View>
    </View>
  );
}
