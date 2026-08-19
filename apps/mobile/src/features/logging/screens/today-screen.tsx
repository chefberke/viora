import { useEffect, useState } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authClient } from '@/shared/lib';
import { useSelectedDayContext } from '../selected-day-context';
import { useEntryParser } from '../use-entry-parser';
import { useSuggestions } from '../use-suggestions';
import { ComposerToolbar } from '../components/composer-toolbar';
import { DaySwipe } from '../components/day-swipe';
import { DaySummaryBar } from '../components/day-summary-bar';
import { LogHeader } from '../components/log-header';
import { MealComposer } from '../components/meal-composer';
import { MealRowsSkeleton } from '../components/meal-rows-skeleton';
import { RefreshStatus } from '../components/refresh-status';

export function TodayScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Cached, so the header greets by name on the first frame.
  const { data: session } = authClient.useSession();

  const selected = useSelectedDayContext();
  const parser = useEntryParser(selected.day);
  const suggestions = useSuggestions(selected.day);

  // Composing is simply "the keyboard is up": the bottom slot swaps on it.
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsComposing(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsComposing(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function handleRowPress(id: string) {
    const kind = parser.rowStates.get(id)?.result?.kind;

    // The day travels with the row: a sheet opened from a past day must read that day.
    if (kind === 'water') {
      router.push({ pathname: '/water', params: { day: String(selected.day) } });
    } else if (kind === 'food') {
      router.push({ pathname: '/entry/[id]', params: { id, day: String(selected.day) } });
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <LogHeader
        name={session?.user.name}
        date={selected.date}
        isToday={selected.isToday}
        daysBack={selected.daysBack}
      />

      {/* The word answers the pull to refresh, and nothing else. A day that is opened or
          stepped to has the skeleton below to say it is coming. */}
      <RefreshStatus active={parser.isRefreshing} />

      {/* Dragging sideways steps between days. It wraps the rows alone: the greeting says
          which day this is, and it should not slide off while saying it. */}
      <DaySwipe
        canGoBack={selected.canGoBack}
        canGoForward={selected.canGoForward}
        onBack={selected.goBack}
        onForward={selected.goForward}
      >
        {/* The composer seeds from the persisted day, so it mounts once the rows are known.
            The key remounts it on every day it is handed, and again after a refresh has
            brought back a new take on the same day. */}
        {parser.seedEntries !== null ? (
          <MealComposer
            key={parser.seedKey}
            initialEntries={parser.seedEntries}
            rowStates={parser.rowStates}
            onRowsChanged={parser.onRowsChanged}
            onRowPress={handleRowPress}
            onRetryRow={parser.retryRow}
            suggestions={suggestions}
            onRefresh={parser.refresh}
          />
        ) : (
          <MealRowsSkeleton />
        )}
      </DaySwipe>

      {/* The bottom slot swaps: the day's numbers when idle, the entry controls while
          composing. The pill opens the day in full, as a sheet like every other one. */}
      <View className="px-4" style={{ paddingBottom: insets.bottom + 8 }}>
        {isComposing ? (
          <ComposerToolbar calories={parser.totals.calories} />
        ) : (
          <DaySummaryBar
            calories={parser.totals.calories}
            waterMl={parser.waterMl}
            onPress={() =>
              router.push({ pathname: '/summary', params: { day: String(selected.day) } })
            }
          />
        )}
      </View>
    </View>
  );
}
