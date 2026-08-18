import { Text, View } from 'react-native';

import { CALORIE_GLYPH } from '../constants';

export function CalorieStat({ value }: { value: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-base">{CALORIE_GLYPH}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
