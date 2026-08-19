import { useLocalSearchParams } from 'expo-router';

import { NutritionSheetScreen, toDayParam } from '@/features/logging';

export default function EntrySheetRoute() {
  // The row was opened from a day, and that is not always today: the sheet has to look
  // the entry up in the day it belongs to.
  const { id, day } = useLocalSearchParams<{ id: string; day?: string }>();

  return <NutritionSheetScreen id={id ?? ''} day={toDayParam(day)} />;
}
