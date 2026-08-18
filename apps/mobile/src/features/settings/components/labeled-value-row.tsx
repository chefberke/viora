import { Text, View } from 'react-native';

export interface LabeledValueRowProps {
  label: string;
  value: string;
}

/** The Name and Email rows. The value carries the weight here, unlike in `SettingsRow`. */
export function LabeledValueRow({ label, value }: LabeledValueRowProps) {
  return (
    <View className="min-h-[56px] flex-row items-center gap-4 px-4 py-3">
      <Text className="text-[15px] text-foreground-muted">{label}</Text>

      {/* An email can wrap; the label never does, so only this side flexes. */}
      <Text className="flex-1 text-right text-[15px] text-foreground">{value}</Text>
    </View>
  );
}
