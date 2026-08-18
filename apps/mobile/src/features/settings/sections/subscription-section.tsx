import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

/** Static. There is no billing yet. */
export function SubscriptionSection() {
  return (
    <SettingsSection title="Subscription">
      <SettingsRow
        icon="ribbon"
        iconClassName="text-warning"
        title="24-Hour Trial Active"
        subtitle="Ends Aug 19, 2026 at 16:09"
      />
      <SettingsRow title="See Plans" tone="accent" accessory="chevron" onPress={() => {}} />
    </SettingsSection>
  );
}
