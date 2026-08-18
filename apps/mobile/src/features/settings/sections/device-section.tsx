import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { useTheme, type ThemePreference } from '@/theme';
import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

const CHOICES: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Only the Appearance row is live. Its chooser is the platform's own: the screen is
 * already a modal, and a custom sheet on top of it would be one too many.
 */
export function DeviceSection() {
  const { preference, setPreference } = useTheme();
  const [automaticTimeZone, setAutomaticTimeZone] = useState(true);

  const current = CHOICES.find((choice) => choice.value === preference) ?? CHOICES[0]!;

  const pickAppearance = () => {
    const labels = CHOICES.map((choice) => choice.label);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Appearance',
          options: [...labels, 'Cancel'],
          cancelButtonIndex: labels.length,
          userInterfaceStyle: preference === 'system' ? undefined : preference,
        },
        (index) => {
          const choice = CHOICES[index];
          if (choice) {
            setPreference(choice.value);
          }
        },
      );
      return;
    }

    Alert.alert('Appearance', undefined, [
      ...CHOICES.map((choice) => ({
        text: choice.label,
        onPress: () => setPreference(choice.value),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <SettingsSection title="Device Settings">
      <SettingsRow
        icon="contrast"
        iconClassName="text-brand"
        title="Appearance"
        value={current.label}
        accessory="caret"
        onPress={pickAppearance}
      />
      <SettingsRow
        icon="globe"
        iconClassName="text-brand"
        title="Automatic Time Zone"
        value="Europe/Istanbul"
        accessory="switch"
        switchValue={automaticTimeZone}
        onSwitchChange={setAutomaticTimeZone}
      />
      <SettingsRow
        icon="mic"
        iconClassName="text-accent"
        title="Dictation Language"
        value="Auto-detect"
        accessory="caret"
        onPress={() => {}}
      />
    </SettingsSection>
  );
}
