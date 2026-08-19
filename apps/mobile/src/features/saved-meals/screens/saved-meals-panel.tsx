import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton } from '@/shared/ui';
import { SavedMealRow } from '../components/saved-meal-row';
import { useSavedMeals } from '../use-saved-meals';

export interface SavedMealsPanelProps {
  onBack: () => void;
}

/**
 * The saved meals, as a page inside the settings modal.
 *
 * A page rather than a sheet: settings is itself a full-screen modal, and nothing else in the
 * app presents a sheet on top of one. The two flows already living here — changing a password,
 * deleting an account — are pages too, so this reads as one of them.
 *
 * The scrolling belongs to the screen, not here: this sits inside the settings modal's own
 * ScrollView, and a second one nested in it would have no height to scroll within.
 *
 * A row opens the meal as a sheet rather than turning into a field. Reading a list and
 * rewriting one of its lines are two different jobs, and the log already separates them the
 * same way — the row shows the figure, the sheet is where the figure is explained and fixed.
 */
export function SavedMealsPanel({ onBack }: SavedMealsPanelProps) {
  const router = useRouter();
  const { savedMeals, isLoaded } = useSavedMeals();

  return (
    <View>
      <View className="mb-6 flex-row items-center gap-3">
        <IconButton
          accessibilityLabel="Back to settings"
          icon={{ name: 'arrow-back', className: 'text-foreground' }}
          onPress={onBack}
        />
        <Text className="text-[22px] font-bold text-foreground">Saved Meals</Text>
      </View>

      {isLoaded && savedMeals.length === 0 ? (
        <Text className="px-1 text-base text-foreground-subtle">
          Nothing yet. Bookmark a meal from its nutrition details to keep it here.
        </Text>
      ) : (
        // The 1px gap is the divider, the same as the item lists in the sheets.
        <View className="gap-px overflow-hidden rounded-3xl">
          {savedMeals.map((meal) => (
            <SavedMealRow
              key={meal.id}
              meal={meal}
              onPress={() => router.push({ pathname: '/saved-meal/[id]', params: { id: meal.id } })}
            />
          ))}
        </View>
      )}
    </View>
  );
}
