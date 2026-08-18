import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

export type TextFieldProps = Omit<TextInputProps, 'className' | 'style'> & {
  label: string;
  /** Shown under the field in the error colour. The field also takes an error border. */
  error?: string | undefined;
};

/** A labelled text input. The label stays visible instead of floating into the placeholder. */
export function TextField({ label, error, ...inputProps }: TextFieldProps) {
  const { colors } = useTheme();

  return (
    <View>
      <Text className="mb-2 text-[13px] font-medium text-foreground-muted">{label}</Text>

      <TextInput
        className={`h-14 rounded-2xl border bg-surface px-4 text-[17px] text-foreground ${
          error ? 'border-macro-carbs' : 'border-border'
        }`}
        placeholderTextColor={colors['foreground-muted']}
        selectionColor={colors.brand}
        accessibilityLabel={label}
        {...inputProps}
      />

      {error ? <Text className="mt-2 text-[13px] text-macro-carbs">{error}</Text> : null}
    </View>
  );
}
