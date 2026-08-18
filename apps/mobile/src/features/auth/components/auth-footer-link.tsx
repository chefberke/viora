import { Pressable, Text } from 'react-native';

export interface AuthFooterLinkProps {
  /** The muted part, e.g. "Already have an account?" */
  prompt: string;
  /** The tappable part, e.g. "Sign in". */
  action: string;
  onPress: () => void;
}

/** The whole row is the press target; the action word alone is under a tap size. */
export function AuthFooterLink({ prompt, action, onPress }: AuthFooterLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      className="mt-5 flex-row items-center justify-center py-2 active:opacity-60"
      onPress={onPress}
    >
      <Text className="text-[15px] text-foreground-muted">{prompt} </Text>
      <Text className="text-[15px] font-semibold text-foreground">{action}</Text>
    </Pressable>
  );
}
