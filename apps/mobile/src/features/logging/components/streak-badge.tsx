import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon, Pill } from '@/shared/ui';
import { CALORIE_GLYPH } from '../constants';

/** The streak count and the settings button share one pill. */
export function StreakBadge({ streak }: { streak: number }) {
  const router = useRouter();

  return (
    <Pill className="gap-2 py-2 pl-3 pr-2.5">
      <Text className="text-sm">{CALORIE_GLYPH}</Text>
      <Text className="text-base font-semibold text-foreground">{streak}</Text>

      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={() => router.push('/settings')}
      >
        <View>
          <Icon name="settings-sharp" size={18} className="text-foreground-muted" />
        </View>
      </Pressable>
    </Pill>
  );
}
