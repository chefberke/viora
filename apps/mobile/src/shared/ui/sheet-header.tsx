import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton } from './icon-button';

export interface SheetHeaderProps {
  title: string;
  /**
   * Anything that belongs beside the close button — a bookmark, so far.
   *
   * It renders inside a grouped row rather than as a sibling of the title, because
   * `justify-between` would otherwise push the two buttons to opposite ends of the sheet.
   * That was the shape both copies of this header had already arrived at independently,
   * comment included, word for word.
   */
  children?: ReactNode;
}

/**
 * The line every sheet opens with: what it is, and the way out.
 *
 * Four screens across two features had their own copy — the log's nutrition, water and day
 * summary sheets, and saved meals' — which is what `AGENTS.md` means by "when a second
 * feature needs something, move it down into `src/shared/`".
 *
 * Two near-misses are deliberately left alone. The calendar sheet has a close button and no
 * title, because `MonthCalendar` already names the month. The settings header looks like
 * this one but is sticky, sized differently and closes to somewhere specific rather than
 * back — folding it in would mean three props that only it ever sets.
 */
export function SheetHeader({ title, children }: SheetHeaderProps) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xl font-semibold text-foreground">{title}</Text>

      <View className="flex-row items-center gap-2">
        {children}

        <IconButton
          icon={{ name: 'close', className: 'text-foreground-muted' }}
          accessibilityLabel="Close"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}
