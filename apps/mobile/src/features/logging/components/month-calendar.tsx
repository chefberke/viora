import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { toZonedDate, useTimeZone } from '@/shared/time';
import { Icon, type IoniconName } from '@/shared/ui';
import { useTheme } from '@/theme';
import {
  WEEKDAY_LABELS,
  addMonths,
  buildMonthWeeks,
  formatMonthLabel,
  fromDayNumber,
  startOfMonth,
  toDayNumber,
} from '../calendar';
import { useToday } from '../use-today';

export interface MonthCalendarProps {
  /** When the account was opened. Nothing was logged before it, so it closes the way back. */
  memberSince?: Date;
  /** The day the log is showing. */
  selectedDay: number;
  /** Days the user wrote something on. Only these and today can be opened. */
  loggedDays: readonly number[];
  onSelectDay: (day: number) => void;
}

/**
 * One month at a time, walked with the two arrows, and the way to jump to a day rather
 * than step to it. A day is only open if it holds a log, or if it is today; the rest are
 * dimmed and take no press, because there is nothing on them to show.
 *
 * The walk is held between the month the account was opened and this month, because
 * neither side can ever hold a log. An account younger than a month leaves a single month
 * to show, so both arrows are then closed.
 *
 * Not a `Pill`: a grid inside a stadium shape loses its corner cells. It takes the corners
 * and the lift of the pills above it instead, so the header reads as one set.
 */
export function MonthCalendar({
  memberSince,
  selectedDay,
  loggedDays,
  onSelectDay,
}: MonthCalendarProps) {
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

  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(fromDayNumber(selectedDay)));

  // Stepping between days from the screen moves the month under them, so opening the
  // calendar always shows the day that is on screen.
  const selectedMonth = startOfMonth(fromDayNumber(selectedDay)).getTime();

  useEffect(() => {
    setVisibleMonth(new Date(selectedMonth));
  }, [selectedMonth]);

  const logged = useMemo(() => new Set(loggedDays), [loggedDays]);

  const canGoBack = visibleMonth.getTime() > firstMonth.getTime();
  const canGoForward = visibleMonth.getTime() < currentMonth.getTime();

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

      {weeks.map((week, weekIndex) => {
        const isLogged = (dayIndex: number) => {
          const day = week[dayIndex];

          return (
            day !== null &&
            day !== undefined &&
            logged.has(toDayNumber(new Date(year, month, day)))
          );
        };

        return (
          // The grid is fixed for the month, so the row and cell positions are the keys.
          <View key={weekIndex} className="mt-0.5 flex-row">
            {week.map((day, dayIndex) => {
              const value = day === null ? 0 : toDayNumber(new Date(year, month, day));
              const hasLog = isLogged(dayIndex);

              // Two logged days side by side are one run, so the tint reaches across the
              // gap between them and the discs read as a single band. A run that meets the
              // end of the row stops there: the next day is on the line below.
              const joinsLeft = hasLog && isLogged(dayIndex - 1);
              const joinsRight = hasLog && isLogged(dayIndex + 1);

              return (
                <View key={dayIndex} className="h-8 flex-1 items-center">
                  {joinsLeft ? (
                    <View className="absolute left-0 top-0 h-8 w-1/2 bg-brand/15" />
                  ) : null}
                  {joinsRight ? (
                    <View className="absolute right-0 top-0 h-8 w-1/2 bg-brand/15" />
                  ) : null}

                  {day === null ? null : (
                    <DayCell
                      day={day}
                      isSelected={value === selectedDay}
                      isToday={value === todayDay}
                      isLogged={hasLog}
                      onPress={() => onSelectDay(value)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Three things are said on one disc. A day that was logged is tinted, so a run of them
 * reads as a streak and the days that were let go stay plain — that is the whole point of
 * the month. The day being read wears the full brand disc, and today wears a ring when it
 * is not the day being read, so the two are never confused.
 *
 * A day with nothing on it takes no press, because there would be nothing to show.
 */
function DayCell({
  day,
  isSelected,
  isToday,
  isLogged,
  onPress,
}: {
  day: number;
  isSelected: boolean;
  isToday: boolean;
  isLogged: boolean;
  onPress: () => void;
}) {
  const isOpen = isLogged || isToday;
  const fill = isSelected ? 'bg-brand' : isLogged ? 'bg-brand/15' : '';
  const ring = isToday && !isSelected ? 'border border-brand' : '';

  return (
    <Pressable
      disabled={!isOpen}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={isLogged ? `${day}, logged` : `${day}`}
      accessibilityState={{ disabled: !isOpen, selected: isSelected }}
      className={`h-8 w-8 items-center justify-center rounded-full ${fill} ${ring}`}
    >
      <Text
        className={
          isSelected
            ? 'text-[13px] font-semibold text-brand-foreground'
            : `text-[13px] ${isOpen ? 'font-medium text-foreground' : 'text-foreground-subtle'}`
        }
      >
        {day}
      </Text>
    </Pressable>
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
