import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { IconButton } from '@/shared/ui';
import { useTheme } from '@/theme';
import { entriesRangeKey, fetchEntriesRange } from '../api';
import type { LogEntryDto } from '../api-types';
import { fromDayNumber, toDayNumber, WEEKDAY_LABELS } from '../calendar';
import { WATER_GLYPH } from '../constants';
import { useToday } from '../use-today';
import { ProgressRing } from '../components/progress-ring';

/** A fixed daily goal until a per-user setting exists. */
const DAILY_GOAL_ML = 2000;

function addDays(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

function waterOf(entries: readonly LogEntryDto[], day: number): number {
  // Mixed rows count too: a meal logged with a glass of water still hydrates.
  return entries
    .filter((entry) => entry.day === day)
    .reduce((sum, entry) => sum + (entry.result?.totals.waterMl ?? 0), 0);
}

export interface WaterSheetScreenProps {
  /** The day the row was opened from. Today when the route carried none. */
  day?: number;
}

/**
 * The bottom sheet behind a water row: the week up to the day it was opened from, a goal
 * ring, and that day's log. The week ends on that day rather than on today, so a row read
 * on a past day is shown among the days around it.
 */
export function WaterSheetScreen({ day }: WaterSheetScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const today = useToday();
  const todayDay = toDayNumber(today);
  const to = day ?? todayDay;

  const days = useMemo(() => {
    const anchor = fromDayNumber(to);

    return Array.from({ length: 7 }, (_, index) => addDays(anchor, index - 6));
  }, [to]);

  const from = toDayNumber(days[0] ?? fromDayNumber(to));

  const [selectedDay, setSelectedDay] = useState(to);

  const { data } = useQuery({
    queryKey: entriesRangeKey(from, to),
    queryFn: () => fetchEntriesRange(from, to),
  });

  const entries = data?.entries ?? [];
  const selectedMl = waterOf(entries, selectedDay);
  const loggedToday = entries.filter(
    (entry) => entry.day === selectedDay && (entry.result?.totals.waterMl ?? 0) > 0,
  );

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-semibold text-foreground">
          {selectedDay === todayDay ? 'Today' : 'Water'}
        </Text>
        <IconButton
          icon={{ name: 'close', className: 'text-foreground-muted' }}
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />
      </View>

      <View className="flex-row justify-between rounded-3xl bg-surface px-4 py-3">
        {days.map((date) => {
          const dayNumber = toDayNumber(date);
          const selected = dayNumber === selectedDay;
          const progress = waterOf(entries, dayNumber) / DAILY_GOAL_ML;

          return (
            <Pressable
              key={dayNumber}
              onPress={() => setSelectedDay(dayNumber)}
              className="items-center gap-1"
              accessibilityLabel={`Show ${date.toDateString()}`}
            >
              <ProgressRing
                size={34}
                strokeWidth={3.5}
                progress={progress}
                color={colors.water}
                trackColor={colors['surface-strong']}
              />
              <Text className={`text-xs ${selected ? 'font-semibold text-water' : 'text-foreground-muted'}`}>
                {WEEKDAY_LABELS[date.getDay()]} {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="items-center gap-4 rounded-3xl bg-surface p-8">
        <ProgressRing
          size={170}
          strokeWidth={12}
          progress={selectedMl / DAILY_GOAL_ML}
          color={colors.water}
          trackColor={colors['surface-strong']}
        >
          <Text className="text-6xl">{WATER_GLYPH}</Text>
        </ProgressRing>

        <View className="items-center gap-1">
          <Text className="text-3xl font-bold text-water">{selectedMl} ml</Text>
          <Text className="text-sm text-foreground-muted">
            {selectedMl} of {DAILY_GOAL_ML} ml
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-base font-medium text-foreground-muted">Logged</Text>
        {loggedToday.length === 0 ? (
          <Text className="px-1 text-base text-foreground-subtle">Nothing yet.</Text>
        ) : (
          <View className="gap-px overflow-hidden rounded-3xl">
            {loggedToday.map((entry) => (
              <View
                key={entry.id}
                className="flex-row items-center justify-between bg-surface px-5 py-4"
              >
                <Text className="text-base text-foreground">🥛 {entry.rawText}</Text>
                <Text className="text-base text-water">{entry.result?.totals.waterMl ?? 0} ml</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
