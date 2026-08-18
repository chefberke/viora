import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from './back-button';

export interface AuthLayoutProps {
  title: string;
  /** One line per paragraph. Rendered muted, under the title. */
  subtitles?: string[];
  /** Shows the circular back control in the top-left corner. */
  showBack?: boolean;
  /** Pinned to the bottom: the button stack and the footer link. */
  actions: ReactNode;
  /** Optional body between the title and the actions, used by the form screens. */
  children?: ReactNode;
}

/**
 * The frame every auth screen is built on. Screens supply copy and buttons; the spacing
 * and safe-area handling live here once, so the four of them cannot drift apart.
 */
export function AuthLayout({
  title,
  subtitles = [],
  showBack = false,
  actions,
  children,
}: AuthLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}
    >
      <View className="h-12 justify-center">{showBack ? <BackButton /> : null}</View>

      {/* Reserved for the brand mark. Empty for now, but it positions the title. */}
      <View className="h-40" />

      <Text className="text-[34px] font-bold leading-[40px] text-foreground">{title}</Text>

      {subtitles.map((line) => (
        <Text key={line} className="mt-3 text-[17px] leading-[24px] text-foreground-muted">
          {line}
        </Text>
      ))}

      {children ? <View className="mt-8">{children}</View> : null}

      <View className="flex-1" />

      <View>{actions}</View>
    </View>
  );
}
