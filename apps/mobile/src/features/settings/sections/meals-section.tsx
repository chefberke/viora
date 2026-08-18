import { useState } from 'react';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

/** Static: the saved list and the summariser both wait on the data layer. */
export function MealsSection() {
  const [summarize, setSummarize] = useState(false);

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
        subtitle="What is this?"
        accessory="switch"
        switchValue={summarize}
        onSwitchChange={setSummarize}
      />
    </SettingsSection>
  );
}
