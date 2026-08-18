import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';

/**
 * Icons take a `color` prop, not a style, so NativeWind cannot theme them on its own.
 * This forwards the color of a text class onto that prop: `className="text-foreground"`.
 * `target: false` keeps the class from also being applied as a style object.
 */
const interopOptions = {
  className: {
    target: false,
    nativeStyleToProp: { color: true },
  },
} as const;

cssInterop(Ionicons, interopOptions);
cssInterop(MaterialIcons, interopOptions);

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface IconBaseProps {
  size?: number;
  /** Tailwind text color class for the glyph, e.g. `text-action-voice`. */
  className?: string;
}

/** Ionicons by default; Material for the few glyphs it lacks, such as `keyboard-hide`. */
export type IconProps = IconBaseProps &
  (
    | { family?: 'ionicons'; name: IoniconName }
    | { family: 'material'; name: MaterialIconName }
  );

export function Icon({ size = 22, className = 'text-foreground', ...props }: IconProps) {
  if (props.family === 'material') {
    return <MaterialIcons name={props.name} size={size} className={className} />;
  }

  return <Ionicons name={props.name} size={size} className={className} />;
}
