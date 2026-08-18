import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { useTimeZone } from '@/shared/time';
import { useTheme, type ThemePreference } from '@/theme';
import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

const CHOICES: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * How the app itself behaves: one setting to make, and one value it only reports. The
 * Appearance chooser is the platform's own — the screen is already a modal, and a custom
 * sheet on top of it would be one too many.
 */
export function AppSection() {
  const { preference, setPreference } = useTheme();
  const timeZone = useTimeZone();

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
    <SettingsSection title="App">
      <SettingsRow
        icon="contrast"
        iconClassName="text-brand"
        title="Appearance"
        value={current.label}
        accessory="caret"
        onPress={pickAppearance}
      />

      {/* Read, not set: the device already answers this, so the row only reports it. */}
      <SettingsRow icon="globe" iconClassName="text-accent" title="Time Zone" value={timeZone} />
    </SettingsSection>
  );
}
