import { Text, View } from 'react-native';

export interface MacroStatProps {
  /** The single letter in front of the value: C, P or F. */
  label: string;
  value: number;
  /** Tailwind text color class for the letter. The value stays neutral. */
  labelClassName: string;
}

export function MacroStat({ label, value, labelClassName }: MacroStatProps) {
  return (
    <View className="flex-row items-center gap-1">
      <Text className={`text-base font-semibold ${labelClassName}`}>{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
