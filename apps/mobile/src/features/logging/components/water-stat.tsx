import { Text, View } from 'react-native';

import { WATER_GLYPH } from '@/shared/macros';

/** Water on the summary bar, written the way the calories beside it are. */
export function WaterStat({ value }: { value: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="text-base">{WATER_GLYPH}</Text>
      <Text className="text-base font-semibold text-foreground-soft">
        {value}
        <Text className="font-normal text-foreground-muted"> ml</Text>
      </Text>
    </View>
  );
}
