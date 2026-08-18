import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { SettingsCard } from './settings-card';

export interface SettingsSectionProps {
  /** Muted heading above the card. Omitted for the account card, which has none. */
  title?: string;
  children: ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View className="mt-6">
      {title ? (
        <Text className="mb-2 px-1 text-[12px] font-medium text-foreground-muted">{title}</Text>
      ) : null}

      <SettingsCard>{children}</SettingsCard>
    </View>
  );
}
