import { useSavedMeals } from '@/features/saved-meals';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

export interface MealsSectionProps {
  onOpenSavedMeals: () => void;
}

/** One row, and it is live: the meals you bookmarked, with how many there are. */
export function MealsSection({ onOpenSavedMeals }: MealsSectionProps) {
  const { savedMeals, isLoaded } = useSavedMeals();

  return (
    <SettingsSection title="Meals">
      <SettingsRow
        icon="bookmark"
        iconClassName="text-warning"
        title="Saved Meals"
        // Blank rather than "0 saved" until the list is in: a wrong count that corrects
        // itself a moment later reads as a bug.
        subtitle={isLoaded ? `${savedMeals.length} saved` : ' '}
        accessory="chevron"
        onPress={onOpenSavedMeals}
      />
    </SettingsSection>
  );
}
