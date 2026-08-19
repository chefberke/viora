import { SUMMARIZE_FOOD_TEXT_KEY, usePersistentFlag } from '@/shared/lib';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

/** The saved list still waits on its own data layer; the summariser switch is live. */
export function MealsSection() {
  const [summarize, setSummarize] = usePersistentFlag(SUMMARIZE_FOOD_TEXT_KEY);

  return (
    <SettingsSection title="Meals">
      <SettingsRow
        icon="bookmark"
        iconClassName="text-warning"
        title="Saved Meals"
        subtitle="0 saved"
        accessory="chevron"
        onPress={() => {}}
      />
      <SettingsRow
        icon="sparkles"
        iconClassName="text-brand"
        title="Summarize Food Text"
        subtitle="Suggest cleaned-up wording for entries"
        accessory="switch"
        switchValue={summarize}
        onSwitchChange={setSummarize}
      />
    </SettingsSection>
  );
}
