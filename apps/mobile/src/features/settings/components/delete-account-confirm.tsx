import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button, Icon, IconButton, TextField } from '@/shared/ui';
import { DELETE_CONFIRMATION_WORD } from '../constants';

export interface DeleteAccountConfirmProps {
  /** Shown so they can see whose account is about to go. */
  email: string;
  isPending: boolean;
  error: string | null;
  clearError: () => void;
  onBack: () => void;
  onConfirm: () => void;
}

/**
 * Step two of two. Typing the word guards against a mis-tap, not against an impostor —
 * the session already proves who is asking, and a second button can be hit by accident.
 */
export function DeleteAccountConfirm({
  email,
  isPending,
  error,
  clearError,
  onBack,
  onConfirm,
}: DeleteAccountConfirmProps) {
  const [typed, setTyped] = useState('');

  // Trimmed for an autocorrect space, but the case still has to match.
  const canDelete = typed.trim() === DELETE_CONFIRMATION_WORD && !isPending;

  return (
    <View>
      <View className="mb-5 flex-row items-center gap-3">
        <IconButton
          accessibilityLabel="Back"
          icon={{ name: 'arrow-back', className: 'text-foreground' }}
          onPress={onBack}
        />
        <Text className="text-[18px] font-semibold text-foreground">Are you sure?</Text>
      </View>

      <View className="flex-row gap-3 rounded-2xl bg-surface p-4">
        <Icon name="warning" size={20} className="text-danger" />

        <View className="flex-1">
          <Text className="text-[15px] font-medium text-foreground">
            This cannot be undone
          </Text>
          <Text className="mt-1 text-[13px] leading-[18px] text-foreground-muted">
            {email} and everything logged under it is deleted immediately. There is no
            restore, and signing up again starts from nothing.
          </Text>
        </View>
      </View>

      <View className="mt-6">
        <TextField
          label={`Type ${DELETE_CONFIRMATION_WORD} to confirm`}
          value={typed}
          onChangeText={(next) => {
            clearError();
            setTyped(next);
          }}
          placeholder={DELETE_CONFIRMATION_WORD}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>

      {error ? (
        <Text className="mt-4 text-center text-[15px] text-danger">{error}</Text>
      ) : null}

      <View className="mt-6">
        <Button
          label="Delete my account"
          variant="danger"
          loading={isPending}
          disabled={!canDelete}
          onPress={onConfirm}
        />
      </View>

      <View className="mt-3">
        <Button label="Keep my account" disabled={isPending} onPress={onBack} />
      </View>
    </View>
  );
}
