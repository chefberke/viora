import { View } from 'react-native';

import { useTheme } from '@/theme';
import { ShimmerText } from './shimmer-text';

export interface LoadingScreenProps {
  /** What is being waited for. Written as a sentence, not a bare "Loading". */
  message?: string;
}

/** A full-screen hold. The message itself shimmers instead of a spinner. */
export function LoadingScreen({ message = 'Loading your profile...' }: LoadingScreenProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <ShimmerText text={message} base={colors['foreground-subtle']} highlight={colors.foreground} />
    </View>
  );
}
