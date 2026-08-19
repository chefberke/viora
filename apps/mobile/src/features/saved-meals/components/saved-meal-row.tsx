import { Pressable, Text, View } from 'react-native';

import type { SavedMealDto } from '@/shared/api-types';
import { CALORIE_GLYPH } from '@/shared/macros';
import { Icon } from '@/shared/ui';

export interface SavedMealRowProps {
  meal: SavedMealDto;
  onPress: () => void;
}

/**
 * One saved meal in the list: the line, and what it comes to.
 *
 * Nothing here can be edited. A row is a thing to recognise at a glance, and the whole row
 * is one target that opens the meal — the same bargain the log makes, where a row is read on
 * the page and worked on in a sheet.
 */
export function SavedMealRow({ meal, onPress }: SavedMealRowProps) {
  const totals = meal.result?.totals;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open "${meal.text}"`}
      className="flex-row items-center gap-3 bg-surface px-5 py-4 active:bg-surface-strong"
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-base text-foreground">{meal.text}</Text>
        <Text className="text-xs text-foreground-muted">
          {totals
            ? `${CALORIE_GLYPH} ${totals.calories} cal · ${totals.protein} g protein`
            : 'No figures yet'}
        </Text>
      </View>

      <Icon name="chevron-forward" size={16} className="text-foreground-subtle" />
    </Pressable>
  );
}
