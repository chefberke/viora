import { Pressable, Text, View } from 'react-native';

/**
 * What a row says when the parse landed but was not sure of itself.
 *
 * It is the quieter sibling of `NoFoodHint`. That one means the line failed; this one means
 * the line worked and one of its foods rests on a guess — a portion nothing in the words
 * fixed, two database rows the ranking could not separate, or no row at all. The parser
 * already knows which; before this it kept that to itself and showed the guess in the same
 * grey as everything it was certain of.
 *
 * No wave under the words, for the same reason the suggestions carry none: a wave means the
 * writing is wrong, and the writing here is fine. It is the reading that is uncertain.
 */
export function NeedsReviewHint({ count, onReview }: { count: number; onReview: () => void }) {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text className="text-base text-foreground-subtle">
        {count === 1 ? 'One item here is a guess.' : `${count} items here are guesses.`}
      </Text>

      <Pressable
        onPress={onReview}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Review the items in this entry"
      >
        <Text className="text-base text-warning">Review</Text>
      </Pressable>
    </View>
  );
}
