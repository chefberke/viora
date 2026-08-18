import { SettingsRow } from '../components/settings-row';
import { SettingsSection } from '../components/settings-section';

export interface AccountActionsSectionProps {
  disabled: boolean;
  onDeleteAccount: () => void;
  onSignOut: () => void;
}

/**
 * Both rows are live. Signing out is ordinary and reads that way; deleting is the last
 * row on the screen, alone in red, because it is the one that cannot be undone.
 */
export function AccountActionsSection({
  disabled,
  onDeleteAccount,
  onSignOut,
}: AccountActionsSectionProps) {
  return (
    <SettingsSection>
      <SettingsRow
        icon="log-out"
        iconClassName="text-foreground-muted"
        title="Sign Out"
        disabled={disabled}
        onPress={onSignOut}
      />
      <SettingsRow
        icon="person-remove"
        iconClassName="text-danger"
        title="Delete Account"
        tone="danger"
        accessory="chevron"
        disabled={disabled}
        onPress={onDeleteAccount}
      />
    </SettingsSection>
  );
}
