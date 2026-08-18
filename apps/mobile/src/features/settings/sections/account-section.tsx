import { LabeledValueRow } from '../components/labeled-value-row';
import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

export interface AccountSectionProps {
  name: string;
  email: string;
  disabled: boolean;
  onChangePassword: () => void;
}

/** Live. The only way into the change-password form. */
export function AccountSection({
  name,
  email,
  disabled,
  onChangePassword,
}: AccountSectionProps) {
  return (
    <SettingsSection>
      <LabeledValueRow label="Name" value={name || '—'} />
      <LabeledValueRow label="Email" value={email || '—'} />
      <SettingsRow
        icon="lock-closed-outline"
        iconClassName="text-accent"
        title="Change password"
        accessory="chevron"
        disabled={disabled}
        onPress={onChangePassword}
      />
    </SettingsSection>
  );
}
