import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { WavyUnderline } from './wavy-underline';

/**
 * What a row says once its parse has landed on nothing: the spellcheck wave under the words,
 * and a line waiting below it. It is the only thing left wearing the wave — the suggestions
 * on an empty row deliberately do not, because a wave means the line is wrong and an empty
 * row is not.
 *
 * Writing the line again is done in place, so it is said rather than pressed; dropping the
 * line needs a press, and it is the only thing here that can be tapped.
 */
export function NoFoodHint({ text, onDelete }: { text: string; onDelete: () => void }) {
  const { colors } = useTheme();

  return (
    <View className="gap-1.5">
      <WavyUnderline text={text} color={colors.danger} />

      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-base text-foreground-subtle">
          No food found here. Try writing it again, or
        </Text>

        <Pressable onPress={onDelete} hitSlop={6} accessibilityLabel="Delete this entry">
          <Text className="text-base text-danger">Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
