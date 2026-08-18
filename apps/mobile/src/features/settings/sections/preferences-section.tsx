import { useState } from 'react';

import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

/** Static. The switch keeps local state only. */
export function PreferencesSection() {
  const [summarize, setSummarize] = useState(false);

  return (
    <SettingsSection title="Preferences">
      <SettingsRow
        icon="stats-chart"
        iconClassName="text-accent"
        title="Customize Goal Bar"
        accessory="chevron"
        onPress={() => {}}
      />
      <SettingsRow
        icon="sparkles"
        iconClassName="text-warning"
        title="Summarize Food Text"
        subtitle="What is this?"
        accessory="switch"
        switchValue={summarize}
        onSwitchChange={setSummarize}
      />
    </SettingsSection>
  );
}
