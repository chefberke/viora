import { useState } from 'react';
import { Text, View } from 'react-native';

import { MIN_PASSWORD_LENGTH, type ChangePasswordInput } from '@/features/auth';
import { Button, IconButton, TextField } from '@/shared/ui';

export interface ChangePasswordFormProps {
  isPending: boolean;
  error: string | null;
  /** Clears the error the moment the user edits a field, so it cannot outlive its cause. */
  clearError: () => void;
  /** Resolves `true` when the change went through. */
  onSubmit: (input: ChangePasswordInput) => Promise<boolean>;
  onBack: () => void;
  /** Called after a successful change, so the sheet can go back to the menu. */
  onDone: () => void;
}

/**
 * Pending and error state come in as props: one `useAuthActions` instance drives this
 * form and the sign-out row, and two hooks would mean two spinners that can disagree.
 */
export function ChangePasswordForm({
  isPending,
  error,
  clearError,
  onSubmit,
  onBack,
  onDone,
}: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Nothing to complain about while the field is still empty.
  const newPasswordError =
    newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : undefined;

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && !isPending;

  const submit = async () => {
    const changed = await onSubmit({ currentPassword, newPassword });
    if (changed) {
      onDone();
    }
  };

  const edit = (set: (value: string) => void) => (next: string) => {
    clearError();
    set(next);
  };

  return (
    <View>
      <View className="mb-6 flex-row items-center gap-3">
        <IconButton
          accessibilityLabel="Back to settings"
          icon={{ name: 'arrow-back', className: 'text-foreground' }}
          onPress={onBack}
        />
        <Text className="text-[18px] font-semibold text-foreground">Change password</Text>
      </View>

      <TextField
        label="Current password"
        value={currentPassword}
        onChangeText={edit(setCurrentPassword)}
        placeholder="Your current password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
      />

      <View className="h-4" />

      <TextField
        label="New password"
        value={newPassword}
        error={newPasswordError}
        onChangeText={edit(setNewPassword)}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => {
          if (canSubmit) {
            void submit();
          }
        }}
      />

      {error ? (
        <Text className="mt-4 text-center text-[15px] text-danger">{error}</Text>
      ) : null}

      <View className="mt-6">
        <Button
          label="Update password"
          loading={isPending}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
