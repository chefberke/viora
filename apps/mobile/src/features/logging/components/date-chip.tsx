import { Text } from 'react-native';

import { Pill } from '@/shared/ui';

/** Static label for now; a date picker lands later. */
export function DateChip({ label }: { label: string }) {
  return (
    <Pill className="px-5 py-2">
      <Text className="text-base font-semibold text-foreground">{label}</Text>
    </Pill>
  );
}
