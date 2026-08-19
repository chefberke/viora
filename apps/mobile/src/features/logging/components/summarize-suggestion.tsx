import { Pressable, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import { WavyUnderline } from './wavy-underline';

/**
 * The "Summarize Food Text" affordance: the typed line gets a spellcheck-red wave, and
 * the cleaned-up wording waits under it in brand purple. A tap hands the suggestion to
 * the composer, which morphs the row into it.
 */
export function SummarizeSuggestion({
  original,
  suggestion,
  onAccept,
}: {
  original: string;
  suggestion: string;
  onAccept: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View className="gap-1.5">
      <WavyUnderline text={original} color={colors.danger} />

      <Pressable
        onPress={onAccept}
        hitSlop={6}
        accessibilityLabel={`Replace with "${suggestion}"`}
        className="self-start"
      >
        <Text className="text-base text-brand">✦ {suggestion}</Text>
      </Pressable>
    </View>
  );
}
