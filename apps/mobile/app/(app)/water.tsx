import { useLocalSearchParams } from 'expo-router';

import { toDayParam, WaterSheetScreen } from '@/features/logging';

export default function WaterSheetRoute() {
  // The week the sheet shows ends on the day the row was opened from, not always today.
  const { day } = useLocalSearchParams<{ day?: string }>();

  return <WaterSheetScreen day={toDayParam(day)} />;
}
