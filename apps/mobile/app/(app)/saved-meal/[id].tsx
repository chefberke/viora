import { useLocalSearchParams } from 'expo-router';

import { SavedMealSheetScreen } from '@/features/saved-meals';

export default function SavedMealSheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <SavedMealSheetScreen id={id ?? ''} />;
}
