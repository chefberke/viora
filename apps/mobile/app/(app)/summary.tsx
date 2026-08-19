import { useLocalSearchParams } from 'expo-router';

import { DaySummarySheetScreen, toDayParam } from '@/features/logging';

export default function DaySummarySheetRoute() {
  // The bar was pressed on a day, and that is not always today.
  const { day } = useLocalSearchParams<{ day?: string }>();

  return <DaySummarySheetScreen day={toDayParam(day)} />;
}
