import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppLogo } from '@/shared/ui';
import { DayGreeting } from './day-greeting';
import { SettingsButton } from './settings-button';

export interface LogHeaderProps {
  /** The full name held on the session. Only the first word is shown. */
  name?: string;
  /** The day the log is showing. */
  date: Date;
  isToday: boolean;
  /** How many days back the shown day sits. Zero on today. */
  daysBack: number;
}

/**
 * The top of the log: the day, centred, and the way out of it.
 *
 * The gear is laid out over the row rather than in it. A centred block cannot stay centred
 * with something beside it — it would be centred in what is left of the row, which is a
 * little off from the middle of the screen. Taken out of the flow, the day sits on the
 * screen's own centre line and the gear keeps the corner.
 *
 * The month is not drawn here. Pressing the date opens it as a sheet, which reads the day
 * it should show for itself.
 */
export function LogHeader({ name, date, isToday, daysBack }: LogHeaderProps) {
  const router = useRouter();

  return (
    <View className="px-5 pt-3">
      <DayGreeting
        name={name}
        date={date}
        isToday={isToday}
        daysBack={daysBack}
        onPressDate={() => router.push('/calendar')}
      />

      {/* The mark and the gear are both held to the greeting's own line, not to the top of
          the block, so they read against the name rather than against the chip below it.
          Out of the flow on either side, they leave the greeting on the screen's centre. */}
      <View className="absolute left-5 top-3 h-[22px] justify-center">
        <AppLogo size={22} />
      </View>

      <View className="absolute right-5 top-3 h-[22px] justify-center">
        <SettingsButton />
      </View>
    </View>
  );
}
