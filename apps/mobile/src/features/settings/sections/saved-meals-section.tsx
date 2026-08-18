import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

/** Static. */
export function SavedMealsSection() {
  return (
    <SettingsSection title="Saved Meals">
      <SettingsRow
        icon="restaurant"
        iconClassName="text-warning"
        title="Manage Saved Meals"
        subtitle="0 saved meals"
        accessory="chevron"
        onPress={() => {}}
      />
    </SettingsSection>
  );
}
