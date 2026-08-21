import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { ParsedItem } from '@/shared/api-types';
import { useTheme } from '@/theme';
import { PORTION_COMMIT_MS, PORTION_MULTIPLIERS } from '../constants';

/** A quantity the API will accept: positive, and not carrying more precision than a portion has. */
function tidy(quantity: number): number {
  return Math.round(quantity * 100) / 100;
}

export interface ItemPortionEditorProps {
  item: ParsedItem;
  disabled: boolean;
  /** Sends the new portion. The unit never changes here — only how much of it. */
  onChange: (quantity: number) => void;
}

/**
 * How much of this food there was.
 *
 * There is no Save button, in keeping with the rest of the app: the number is simply written
 * on, it rests, and the row catches up. Changing a portion is the ordinary thing to do on
 * this screen, not a mode to enter.
 *
 * The multipliers are the other half of that. "Half of it" is the correction people actually
 * make, and asking them to open a keyboard and divide by two to say so is asking them not to
 * bother. They are relative to whatever the row already says, so the same four buttons work
 * on 200 g, on one bowl, and on two slices.
 */
export function ItemPortionEditor({ item, disabled, onChange }: ItemPortionEditorProps) {
  const { colors } = useTheme();
  const [typed, setTyped] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The commit-on-unmount below runs from a cleanup, which closes over its first render's
  // values. These refs are what let it send what was actually typed.
  const pending = useRef<number | null>(null);
  const commit = useRef(onChange);

  commit.current = onChange;

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }

      // A sheet is drag-dismissable, so the last thing typed is regularly still resting when
      // the screen goes. Sending it on the way out is the difference between a correction and
      // a correction that silently did not happen.
      if (pending.current !== null) {
        commit.current(pending.current);
      }
    };
  }, []);

  const send = (quantity: number): void => {
    pending.current = null;

    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    onChange(quantity);
  };

  const onType = (text: string): void => {
    // Both separators: a Turkish keyboard writes a decimal with a comma.
    const quantity = Number(text.replace(',', '.'));

    setTyped(text);

    if (timer.current !== null) {
      clearTimeout(timer.current);
    }

    if (!Number.isFinite(quantity) || quantity <= 0 || quantity === item.quantity) {
      pending.current = null;
      return;
    }

    pending.current = tidy(quantity);
    timer.current = setTimeout(() => {
      timer.current = null;
      send(tidy(quantity));
    }, PORTION_COMMIT_MS);
  };

  return (
    <View className="gap-2">
      <Text className="text-xs font-medium text-foreground-muted">Portion</Text>

      <View className="flex-row items-center gap-2">
        {PORTION_MULTIPLIERS.map(({ label, factor }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`Set the portion to ${label} what it is now`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => {
              setTyped(null);
              send(tidy(item.quantity * factor));
            }}
            className={`h-10 flex-1 items-center justify-center rounded-2xl bg-surface-strong active:opacity-70 ${
              disabled ? 'opacity-50' : ''
            }`}
          >
            <Text className="text-[15px] text-foreground">{label}</Text>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center gap-2">
        <TextInput
          className="h-10 flex-1 rounded-2xl border border-border bg-surface px-3 text-[15px] text-foreground"
          value={typed ?? String(item.quantity)}
          onChangeText={onType}
          onBlur={() => setTyped(null)}
          keyboardType="decimal-pad"
          editable={!disabled}
          selectTextOnFocus
          placeholderTextColor={colors['foreground-muted']}
          selectionColor={colors.brand}
          accessibilityLabel={`Portion in ${item.unit}`}
        />
        <Text className="text-[15px] text-foreground-muted">{item.unit}</Text>
      </View>
    </View>
  );
}
