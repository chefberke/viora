import { Text } from 'react-native';

/**
 * One sentence, in the colour this app refuses things in.
 *
 * There were eight copies of this line and they had drifted into two colours: the settings
 * screens said `text-danger`, the auth screens said `text-macro-carbs` — a token that means
 * "carbohydrates on a chart" and reached the sign-in form because it happens to be red.
 * Nothing chose that; it was copied. `danger` is the token whose name matches what the text
 * is doing, so it is the one that survives.
 *
 * `field` is the smaller variant used under a text input, which needs to sit closer and
 * read quieter than a form-level refusal.
 */
export interface ErrorTextProps {
  children: string | null | undefined;
  variant?: 'form' | 'field';
  className?: string;
}

export function ErrorText({ children, variant = 'form', className = '' }: ErrorTextProps) {
  if (!children) {
    return null;
  }

  const base =
    variant === 'field'
      ? 'mt-2 text-[13px] text-danger'
      : 'mt-4 text-center text-[15px] text-danger';

  return (
    // `alert` so a refusal is announced when it appears rather than only when reached.
    <Text className={`${base} ${className}`.trim()} accessibilityRole="alert">
      {children}
    </Text>
  );
}
