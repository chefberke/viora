import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { IconButton } from '@/shared/ui';
import { useTheme } from '@/theme';
import { entriesDayKey, fetchEntriesByDay } from '../api';
import type { ConfidenceLevel } from '../api-types';
import { toDayNumber } from '../calendar';
import { CALORIE_GLYPH, MACROS } from '../constants';
import { useToday } from '../use-today';
import { NutritionItemRow } from '../components/nutrition-item-row';
import { ProgressRing } from '../components/progress-ring';

const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const LEVEL_CLASS: Record<ConfidenceLevel, string> = {
  high: 'text-success',
  medium: 'text-warning',
  low: 'text-danger',
};

export interface NutritionSheetScreenProps {
  id: string;
  /** The day the row was opened from. Today when the route carried none. */
  day?: number;
}

/** The bottom sheet behind a food row's calorie label. */
export function NutritionSheetScreen({ id, day }: NutritionSheetScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const today = useToday();
  const shownDay = day ?? toDayNumber(today);
  // Which item drawers are open, by index. Several may be, so two foods can be compared.
  const [openItems, setOpenItems] = useState<ReadonlySet<number>>(() => new Set());

  const toggleItem = useCallback((index: number) => {
    setOpenItems((open) => {
      const next = new Set(open);

      if (!next.delete(index)) {
        next.add(index);
      }

      return next;
    });
  }, []);

  const { data } = useQuery({
    queryKey: entriesDayKey(shownDay),
    queryFn: () => fetchEntriesByDay(shownDay),
  });

  const entry = data?.entries.find((item) => item.id === id);
  const result = entry?.result;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-semibold text-foreground">Nutrition Details</Text>
        <IconButton
          icon={{ name: 'close', className: 'text-foreground-muted' }}
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />
      </View>

      {!entry || !result ? (
        <Text className="text-base text-foreground-muted">This entry is gone.</Text>
      ) : (
        <>
          <Text className="text-3xl font-bold text-foreground">{entry.rawText}</Text>

          <View className="items-center gap-4 rounded-3xl bg-surface p-6">
            <Text className="text-foreground">
              <Text className="text-4xl font-bold">
                {CALORIE_GLYPH} {result.totals.calories}
              </Text>
              <Text className="text-base text-foreground-muted">  total calories</Text>
            </Text>

            <View className="w-full flex-row justify-around">
              {MACROS.map((macro) => (
                <View key={macro.key} className="items-center gap-0.5">
                  <Text className="text-lg font-semibold text-foreground">
                    {result.totals[macro.key]} g
                  </Text>
                  <Text className={`text-sm ${macro.colorClassName}`}>{macro.name}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-base font-medium text-foreground-muted">Items</Text>
            <View className="gap-px overflow-hidden rounded-3xl">
              {result.items.map((item, index) => (
                <NutritionItemRow
                  key={`${item.name}-${index}`}
                  item={item}
                  isOpen={openItems.has(index)}
                  onToggle={() => toggleItem(index)}
                />
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-base font-medium text-foreground-muted">Thought process</Text>
            <View className="gap-4 rounded-3xl bg-surface p-5">
              <View className="flex-row items-center gap-4">
                <ProgressRing
                  size={56}
                  strokeWidth={5}
                  progress={result.confidence}
                  color={colors[result.confidenceLevel === 'high' ? 'success' : result.confidenceLevel === 'medium' ? 'warning' : 'danger']}
                  trackColor={colors['surface-strong']}
                >
                  <Text className="text-sm font-semibold text-foreground">
                    {Math.round(result.confidence * 100)}
                  </Text>
                </ProgressRing>
                <View className="gap-0.5">
                  <Text className="text-sm text-foreground-muted">Confidence level</Text>
                  <Text className={`text-lg font-semibold ${LEVEL_CLASS[result.confidenceLevel]}`}>
                    {LEVEL_LABEL[result.confidenceLevel]}
                  </Text>
                </View>
              </View>

              {result.reasoning !== '' ? (
                <Text className="text-base leading-6 text-foreground">{result.reasoning}</Text>
              ) : null}

              <Pressable onPress={() => router.back()} hitSlop={6}>
                <Text className="text-base text-brand">✎ Something off? Edit the entry</Text>
              </Pressable>
            </View>
          </View>

          {result.sources.length > 0 ? (
            <View className="gap-2">
              <Text className="text-base font-medium text-foreground-muted">References</Text>
              <View className="gap-px overflow-hidden rounded-3xl">
                {result.sources.map((source, index) => (
                  <View key={`${source.title}-${index}`} className="bg-surface px-5 py-4">
                    <Text className="text-base text-foreground">{source.title}</Text>
                    <Text className="text-xs text-foreground-muted">
                      {source.kind === 'usda'
                        ? `USDA FoodData Central #${source.fdcId}`
                        : 'Language-model estimate'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
