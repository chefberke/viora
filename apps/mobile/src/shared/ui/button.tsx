import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconProps } from './icon';

/**
 * `brand` is the way forward through a flow. `surface` is an alternative of equal weight.
 * `danger` destroys something, and looks quieter than `brand` on purpose.
 */
export type ButtonVariant = 'brand' | 'surface' | 'danger';

export type ButtonProps = Omit<PressableProps, 'children' | 'style' | 'disabled'> & {
  label: string;
  variant?: ButtonVariant;
  /** Optional glyph before the label. Its own `className` sets its colour. */
  icon?: IconProps;
  /** Swaps the label for a spinner and blocks presses. */
  loading?: boolean;
  disabled?: boolean;
};

const VARIANTS: Record<ButtonVariant, { container: string; label: string }> = {
  brand: {
    container: 'bg-brand active:bg-brand-strong',
    label: 'text-brand-foreground',
  },
  surface: {
    container: 'bg-surface active:bg-surface-strong border border-border',
    label: 'text-foreground',
  },
  danger: {
    container: 'bg-surface active:bg-surface-strong border border-border',
    label: 'text-danger',
  },
};

/** The spinner matches the label it replaces. */
const SPINNER_COLORS: Record<ButtonVariant, (colors: Record<string, string>) => string> = {
  brand: (colors) => colors['brand-foreground']!,
  surface: (colors) => colors.foreground!,
  danger: (colors) => colors.danger!,
};

/** Full-width pill. It fixes its own height so a stack of buttons stays even. */
export function Button({
  label,
  variant = 'brand',
  icon,
  loading = false,
  disabled = false,
  className = '',
  ...pressableProps
}: ButtonProps) {
  const { colors } = useTheme();
  const styles = VARIANTS[variant];
  const isBlocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isBlocked, busy: loading }}
      disabled={isBlocked}
      className={`h-14 flex-row items-center justify-center rounded-full px-6 ${styles.container} ${isBlocked ? 'opacity-50' : ''} ${className}`}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color={SPINNER_COLORS[variant](colors)} />
      ) : (
        <>
          {icon ? (
            <View className="mr-3">
              <Icon size={20} {...icon} />
            </View>
          ) : null}
          <Text className={`text-[17px] font-semibold ${styles.label}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}
