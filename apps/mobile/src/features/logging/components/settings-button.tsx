import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon } from '@/shared/ui';

/**
 * The only way into settings. Bare, not the floating `IconButton`: it already rides on
 * the header pill, and a lift on top of a lift reads as noise. A press still answers,
 * with the same tint the round buttons use plus a glyph that steps up to full contrast.
 * The negative margin cancels the padding that carries the tint, so the halo grows the
 * hit area without moving the glyph inside the pill.
 */
export function SettingsButton() {
  const router = useRouter();

  return (
    <Pressable
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      className="-m-1.5 rounded-full p-1.5 active:bg-surface-strong"
      onPress={() => router.push('/settings')}
    >
      {({ pressed }) => (
        <Icon
          name="settings-sharp"
          size={18}
          className={pressed ? 'text-foreground' : 'text-foreground-muted'}
        />
      )}
    </Pressable>
  );
}
