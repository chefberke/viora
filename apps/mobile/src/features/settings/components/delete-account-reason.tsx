import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Icon, IconButton } from '@/shared/ui';
import { DELETION_REASONS } from '../constants';

export interface DeleteAccountReasonProps {
  onBack: () => void;
  onContinue: (input: { reason: string }) => void;
}

/**
 * Step one of two. Each reason is its own card, so the whole card is the tap target. The
 * set is closed on purpose: the answers can be counted, and nothing personal is collected.
 */
export function DeleteAccountReason({ onBack, onContinue }: DeleteAccountReasonProps) {
  const [reason, setReason] = useState<string | null>(null);

  return (
    <View>
      <View className="mb-6 flex-row items-center gap-3">
        <IconButton
          accessibilityLabel="Back to settings"
          icon={{ name: 'arrow-back', className: 'text-foreground' }}
          onPress={onBack}
        />
        <Text className="text-[18px] font-semibold text-foreground">Delete account</Text>
      </View>

      <Text className="mb-1 text-[20px] font-semibold text-foreground">
        Why are you leaving?
      </Text>
      <Text className="mb-6 text-[15px] leading-[21px] text-foreground-muted">
        Pick the closest one. It is the only way we find out what is wrong.
      </Text>

      <View className="gap-2.5">
        {DELETION_REASONS.map((option) => {
          const isSelected = reason === option.id;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={option.label}
              onPress={() => setReason(option.id)}
              className={`min-h-[56px] flex-row items-center gap-3 rounded-2xl border px-4 py-3 active:bg-surface-strong ${
                isSelected ? 'border-brand bg-surface' : 'border-transparent bg-surface'
              }`}
            >
              <Icon
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                className={isSelected ? 'text-brand' : 'text-foreground-subtle'}
              />
              <Text
                className={`flex-1 text-[15px] ${
                  isSelected ? 'font-medium text-foreground' : 'text-foreground'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The filled button is the way back out; continuing is the quieter of the two. */}
      <View className="mt-8">
        <Button
          label="Continue"
          variant="surface"
          disabled={reason === null}
          onPress={() => {
            if (reason) {
              onContinue({ reason });
            }
          }}
        />
      </View>

      <View className="mt-3">
        <Button label="Keep my account" onPress={onBack} />
      </View>
    </View>
  );
}
