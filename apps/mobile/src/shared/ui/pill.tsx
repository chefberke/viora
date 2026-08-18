import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The rounded container used across the app. It owns the shape, the surface colour and
 * the lift only; callers add their own padding, so it covers chips and bars alike.
 */
export function Pill({ className = '', style, children, ...rest }: ViewProps) {
  const { shadow } = useTheme();

  return (
    <View
      className={`flex-row items-center rounded-full bg-surface ${className}`}
      style={[shadow, style]}
      {...rest}
    >
      {children}
    </View>
  );
}
