import { Image, View } from 'react-native';

const MARK = require('../../../assets/logo.png');

/** The corner radius iOS itself uses, as a share of the icon's edge. */
const RADIUS_RATIO = 0.2237;

export interface AppLogoProps {
  /** Edge length in points. The art is square, so one number covers both sides. */
  size?: number;
  className?: string;
}

/**
 * The app mark: the same square art the launcher icon is cut from, rounded the way the
 * home screen rounds it. It carries its own cream field, so it needs no surface under it.
 */
export function AppLogo({ size = 96, className = '' }: AppLogoProps) {
  return (
    <View
      className={`overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: size * RADIUS_RATIO }}
    >
      <Image source={MARK} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  );
}
