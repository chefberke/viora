import { View } from 'react-native';

import { SkeletonBar, useSkeletonPulse } from '@/shared/ui';

export interface SettingsRowSkeletonProps {
  /** Leaves room for the leading glyph, for a row that will have one. */
  icon?: boolean;
  /** Draws the right-hand bar, for a row that will carry a value there. */
  value?: boolean;
}

/**
 * A row that is still being answered by the server. It holds the height and the shape of
 * the real row, so nothing on the card moves when the answer lands.
 */
export function SettingsRowSkeleton({ icon = false, value = false }: SettingsRowSkeletonProps) {
  const opacity = useSkeletonPulse();

  return (
    // Nothing here is readable, so it is kept out of the accessibility tree.
    <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3" aria-hidden>
      {icon ? <SkeletonBar width={20} height={20} opacity={opacity} /> : null}
      <SkeletonBar width={icon ? 132 : 60} opacity={opacity} />

      <View className="flex-1" />

      {value ? <SkeletonBar width={92} opacity={opacity} /> : null}
    </View>
  );
}
