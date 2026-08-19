import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authClient } from '@/shared/lib';
import { IconButton } from '@/shared/ui';
import { useSelectedDayContext } from '../selected-day-context';
import { MonthCalendar } from '../components/month-calendar';

/**
 * The month, as a sheet from the bottom.
 *
 * It carries no heading: `MonthCalendar` already names the month it is on, so a title would
 * only say the same thing twice. The close takes a row to itself above the month rather
 * than a place beside it, which is where the forward arrow already sits.
 *
 * A plain `View`, never `flex-1` — the sheet is sized to its contents, so anything that
 * fills the height would ask the sheet to fill the screen.
 */
export function CalendarSheetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const { day, loggedDays, select } = useSelectedDayContext();

  return (
    <View className="gap-2 px-5 pt-3" style={{ paddingBottom: insets.bottom + 16 }}>
      <IconButton
        className="self-end"
        icon={{ name: 'close', className: 'text-foreground-muted' }}
        accessibilityLabel="Close"
        onPress={() => router.back()}
      />

      <MonthCalendar
        memberSince={session?.user.createdAt}
        selectedDay={day}
        loggedDays={loggedDays}
        onSelectDay={(value) => {
          select(value);
          // The day is chosen; the month has said all it had to say.
          router.back();
        }}
      />
    </View>
  );
}
