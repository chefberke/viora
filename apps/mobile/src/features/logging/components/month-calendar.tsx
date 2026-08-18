import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { toZonedDate, useTimeZone } from '@/shared/time';
import { Icon, type IoniconName } from '@/shared/ui';
import { useTheme } from '@/theme';
import {
  WEEKDAY_LABELS,
  addMonths,
  buildMonthWeeks,
  formatMonthLabel,
  startOfMonth,
  toDayNumber,
} from '../calendar';
import { useToday } from '../use-today';

export interface MonthCalendarProps {
  /** When the account was opened. Nothing was logged before it, so it closes the way back. */
  memberSince?: Date;
}

/**
 * One month at a time, walked with the two arrows. The run of logged days will be drawn
 * onto these same cells once the data layer exists; for now only today is marked.
 *
 * The walk is held between the month the account was opened and this month, because
 * neither side can ever hold a log. An account younger than a month leaves a single month
 * to show, so both arrows are then closed.
 *
 * Not a `Pill`: a grid inside a stadium shape loses its corner cells. It takes the corners
 * and the lift of the pills above it instead, so the header reads as one set.
 */
export function MonthCalendar({ memberSince }: MonthCalendarProps) {
  const { shadow } = useTheme();
  const timeZone = useTimeZone();
  const today = useToday();

  // The join date arrives as an instant. Read in the same zone as today, it lands on the
  // day the user would say they joined.
  const joined = memberSince ? toZonedDate(memberSince, timeZone) : undefined;

  const currentMonth = startOfMonth(today);
  // A join date the clock has not reached yet would shut the calendar out of its own month.
  const firstMonth =
    joined && joined.getTime() < today.getTime() ? startOfMonth(joined) : currentMonth;

  const [visibleMonth, setVisibleMonth] = useState(currentMonth);

  const canGoBack = visibleMonth.getTime() > firstMonth.getTime();
  const canGoForward = visibleMonth.getTime() < currentMonth.getTime();

  // No join date yet, on the frame before the session resolves: dim nothing rather than
  // dimming the whole month.
  const firstDay = joined ? toDayNumber(joined) : 0;
  const todayDay = toDayNumber(today);
  const weeks = buildMonthWeeks(visibleMonth);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  return (
    <View className="rounded-[28px] bg-surface px-4 pb-3 pt-3" style={shadow}>
      <View className="flex-row items-center justify-between">
        <MonthArrow
          icon="chevron-back"
          label="Previous month"
          disabled={!canGoBack}
          onPress={() => setVisibleMonth((visible) => addMonths(visible, -1))}
        />

        <Text className="text-[14px] font-semibold text-foreground">
          {formatMonthLabel(visibleMonth)}
        </Text>

        <MonthArrow
          icon="chevron-forward"
          label="Next month"
          disabled={!canGoForward}
          onPress={() => setVisibleMonth((visible) => addMonths(visible, 1))}
        />
      </View>

      <View className="mt-2 flex-row">
        {WEEKDAY_LABELS.map((label) => (
          <Text
            key={label}
            className="flex-1 text-center text-[10px] font-medium text-foreground-subtle"
          >
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        // The grid is fixed for the month, so the row and cell positions are the keys.
        <View key={weekIndex} className="mt-0.5 flex-row">
          {week.map((day, dayIndex) => {
            const value = day === null ? 0 : toDayNumber(new Date(year, month, day));

            return (
              <View key={dayIndex} className="flex-1 items-center">
                {day === null ? null : (
                  <DayCell
                    day={day}
                    isToday={value === todayDay}
                    isOutside={value < firstDay || value > todayDay}
                  />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Today wears the brand disc. A day with no log to hold is dimmed rather than hidden. */
function DayCell({
  day,
  isToday,
  isOutside,
}: {
  day: number;
  isToday: boolean;
  isOutside: boolean;
}) {
  return (
    <View
      className={`h-8 w-8 items-center justify-center rounded-full ${isToday ? 'bg-brand' : ''}`}
    >
      <Text
        className={
          isToday
            ? 'text-[13px] font-semibold text-brand-foreground'
            : `text-[13px] ${isOutside ? 'text-foreground-subtle' : 'text-foreground'}`
        }
      >
        {day}
      </Text>
    </View>
  );
}

/** A month step. Closed off at either end of the account's life, and dimmed to say so. */
function MonthArrow({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-8 w-8 items-center justify-center rounded-full active:bg-surface-strong"
      onPress={onPress}
    >
      <Icon
        name={icon}
        size={16}
        className={disabled ? 'text-foreground-subtle' : 'text-foreground-muted'}
      />
    </Pressable>
  );
}
