import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

import { useTheme } from '@/theme';

export type PillProps = ViewProps & {
  /** Given, the pill is the button itself: it takes the press and tints while held. */
  onPress?: PressableProps['onPress'];
};

/**
 * The rounded container used across the app. It owns the shape, the surface colour and
 * the lift only; callers add their own padding, so it covers chips and bars alike.
 */
export function Pill({ className = '', style, children, onPress, ...rest }: PillProps) {
  const { shadow } = useTheme();
  const shape = `flex-row items-center rounded-full bg-surface ${className}`;

  if (onPress) {
    return (
      <Pressable
        className={`${shape} active:bg-surface-strong`}
        style={[shadow, style]}
        onPress={onPress}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View className={shape} style={[shadow, style]} {...rest}>
      {children}
    </View>
  );
}
