import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui';
import type { ItemCandidate } from '@/shared/api-types';

/** What this row would come to at the weight the item already has. */
function caloriesAt(candidate: ItemCandidate, grams: number): number {
  return Math.round((candidate.per100g.kcal * grams) / 100);
}

/** Where the row comes from, written the way the item's own credit line writes it. */
const PROVIDER_NAME: Record<ItemCandidate['provider'], string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
};

export interface FoodCandidateRowProps {
  candidate: ItemCandidate;
  /** The weight the calories are shown at — what picking this row would actually log. */
  grams: number;
  isSelected: boolean;
  disabled: boolean;
  onPress: () => void;
}

/**
 * One row a person can price their food from.
 *
 * The calories are the point of it. USDA answers "greek yogurt" with ten rows carrying that
 * exact description and energies from 65 to 467 per 100 g — nothing in the words separates
 * them, so a list that showed only the words would be asking someone to choose at random.
 * Shown at the item's own weight rather than per 100 g, because that is the number the
 * choice actually changes.
 */
export function FoodCandidateRow({
  candidate,
  grams,
  isSelected,
  disabled,
  onPress,
}: FoodCandidateRowProps) {
  const detail =
    candidate.detail === '' ? PROVIDER_NAME[candidate.provider] : candidate.detail;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={`${candidate.description}, ${caloriesAt(candidate, grams)} calories`}
      accessibilityHint={detail}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[56px] flex-row items-center gap-3 rounded-2xl border bg-surface px-4 py-3 active:bg-surface-strong ${
        isSelected ? 'border-brand' : 'border-transparent'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <Icon
        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        className={isSelected ? 'text-brand' : 'text-foreground-subtle'}
      />

      <View className="flex-1 gap-0.5 pr-2">
        <Text className="text-[15px] text-foreground" numberOfLines={1}>
          {candidate.description}
        </Text>
        <Text className="text-xs text-foreground-subtle" numberOfLines={1}>
          {detail}
        </Text>
      </View>

      <Text className="text-[15px] text-foreground-muted">{caloriesAt(candidate, grams)} cal</Text>
    </Pressable>
  );
}
