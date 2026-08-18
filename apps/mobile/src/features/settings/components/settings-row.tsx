import { Pressable, Switch, Text, View } from 'react-native';

import { Icon, type IoniconName } from '@/shared/ui';
import { useTheme } from '@/theme';

/** What sits at the right edge of the row. */
export type RowAccessory = 'chevron' | 'caret' | 'switch' | 'none';

/** Colours the title. The leading glyph is coloured separately by `iconClassName`. */
export type RowTone = 'default' | 'accent' | 'warning' | 'danger';

export interface SettingsRowProps {
  /** Leading glyph. Rows without one, such as "Manage Nutrition Goals", omit it. */
  icon?: IoniconName;
  /** Tailwind text colour for the glyph, e.g. `text-accent`. */
  iconClassName?: string;
  title: string;
  subtitle?: string;
  /** Right-aligned muted text, e.g. "System" or "Europe/Istanbul". */
  value?: string;
  accessory?: RowAccessory;
  switchValue?: boolean;
  onSwitchChange?: (next: boolean) => void;
  tone?: RowTone;
  onPress?: () => void;
  disabled?: boolean;
}

const TONES: Record<RowTone, string> = {
  default: 'text-foreground',
  accent: 'text-accent',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * Every line in the settings list except the account value rows. One component, because
 * the rows differ only in which slots they fill — and 25 of them must share one height.
 */
export function SettingsRow({
  icon,
  iconClassName = 'text-foreground-muted',
  title,
  subtitle,
  value,
  accessory = 'none',
  switchValue = false,
  onSwitchChange,
  tone = 'default',
  onPress,
  disabled = false,
}: SettingsRowProps) {
  const { colors } = useTheme();

  const body = (
    <View
      className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {icon ? <Icon name={icon} size={20} className={iconClassName} /> : null}

      <View className="flex-1">
        <Text className={`text-[15px] ${TONES[tone]}`}>{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 text-[12px] leading-[16px] text-foreground-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text className="max-w-[45%] text-right text-[13px] text-foreground-muted">{value}</Text>
      ) : null}

      {accessory === 'chevron' ? (
        <Icon name="chevron-forward" size={18} className="text-foreground-subtle" />
      ) : null}

      {accessory === 'caret' ? (
        <Icon name="chevron-down" size={16} className="text-foreground-subtle" />
      ) : null}

      {accessory === 'switch' ? (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ false: colors['surface-strong'], true: colors.success }}
          ios_backgroundColor={colors['surface-strong']}
        />
      ) : null}
    </View>
  );

  // A switch row is not tappable as a whole: two targets for one setting confuse.
  if (!onPress) {
    return body;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="active:bg-surface-strong"
    >
      {body}
    </Pressable>
  );
}
