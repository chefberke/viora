import type { SignInMethods } from '@/features/auth';
import { LabeledValueRow } from '../components/labeled-value-row';
import { SettingsRow } from '../components/settings-row';
import { SettingsRowSkeleton } from '../components/settings-row-skeleton';
import { SettingsSection } from '../components/settings-section';

export interface AccountSectionProps {
  name: string;
  email: string;
  /** What the account signs in through. The server answers this, so it arrives late. */
  signIn: SignInMethods;
  disabled: boolean;
  onChangePassword: () => void;
}

/**
 * Live. The change-password row appears only for an account that has a password: the
 * server refuses the change on any other, so offering it would lead to a dead end.
 *
 * Both rows below the email wait on that answer, and hold their place with a skeleton
 * until it lands. Rows that appear one after another read as a card still being built.
 */
export function AccountSection({
  name,
  email,
  signIn,
  disabled,
  onChangePassword,
}: AccountSectionProps) {
  const provider = signIn.providers.join(', ');

  return (
    <SettingsSection>
      <LabeledValueRow label="Name" value={name || '—'} />
      <LabeledValueRow label="Email" value={email || '—'} />

      {signIn.isPending ? <SettingsRowSkeleton value /> : null}
      {!signIn.isPending && provider ? <LabeledValueRow label="Provider" value={provider} /> : null}

      {signIn.isPending ? <SettingsRowSkeleton icon /> : null}
      {!signIn.isPending && signIn.hasPassword ? (
        <SettingsRow
          icon="lock-closed"
          iconClassName="text-accent"
          title="Change Password"
          accessory="chevron"
          disabled={disabled}
          onPress={onChangePassword}
        />
      ) : null}
    </SettingsSection>
  );
}
