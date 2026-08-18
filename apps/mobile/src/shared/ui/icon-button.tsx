import { Pressable, type PressableProps } from 'react-native';

import { useTheme } from '@/theme';
import { Icon, type IconProps } from './icon';

export type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: IconProps;
};

/**
 * Circular action button. The icon is one object, not flat props, so its `name` and
 * `className` cannot collide with the Pressable's own props.
 */
export function IconButton({ icon, className = '', ...pressableProps }: IconButtonProps) {
  const { shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      className={`h-12 w-12 items-center justify-center rounded-full bg-surface active:bg-surface-strong ${className}`}
      style={shadow}
      {...pressableProps}
    >
      <Icon {...icon} />
    </Pressable>
  );
}
