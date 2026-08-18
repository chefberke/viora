import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

export interface AccountActionsSectionProps {
  disabled: boolean;
  onDeleteAccount: () => void;
  onSignOut: () => void;
}

/** Both rows are live. */
export function AccountActionsSection({
  disabled,
  onDeleteAccount,
  onSignOut,
}: AccountActionsSectionProps) {
  return (
    <SettingsSection>
      <SettingsRow
        icon="person-remove"
        iconClassName="text-danger"
        title="Delete Account"
        tone="danger"
        accessory="chevron"
        disabled={disabled}
        onPress={onDeleteAccount}
      />
      <SettingsRow
        icon="log-out"
        iconClassName="text-danger"
        title="Sign Out"
        tone="danger"
        disabled={disabled}
        onPress={onSignOut}
      />
    </SettingsSection>
  );
}
