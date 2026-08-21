import { Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { SelectedDayProvider } from '@/features/logging';
import { logError } from '@/shared/lib';
import { useTheme } from '@/theme';

// Names the screen under the modal. Without it, a deep link straight to `/settings`
// opens it as the first screen in the stack, with nothing behind it.
export const unstable_settings = { anchor: 'index' };

/**
 * Catches a crash in any screen of the signed-in app.
 *
 * The one in `app/_layout.tsx` renders outside every provider and replaces the whole tree;
 * this one is inside them, so it keeps the theme, and — the point of having two — a
 * sheet that throws while rendering a bad parse no longer blanks the app someone was
 * halfway through using.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  logError('render_crashed', error, { boundary: 'app' });

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <Text className="text-center text-[17px] font-semibold text-foreground">
        This screen could not be shown.
      </Text>
      <Text className="text-center text-[15px] text-foreground-muted">
        Nothing you logged was lost.
      </Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        className="rounded-full bg-surface px-6 py-3 active:bg-surface-strong"
      >
        <Text className="text-[15px] text-foreground">Try again</Text>
      </Pressable>
    </View>
  );
}

export default function AppLayout() {
  // The modal background follows the chosen theme, not the device one.
  const { colors } = useTheme();

  return (
    // The calendar sheet and the log are siblings in this stack, so the day they share has
    // to sit above both of them.
    <SelectedDayProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* A full-screen modal, not a sheet: iOS keeps a top inset on the largest detent
            and `sheetShouldOverflowTopInset` is Android-only. The cost is no drag-to-dismiss,
            so the close button in `settings-header.tsx` is required. */}
        <Stack.Screen
          name="settings"
          options={{
            presentation: 'fullScreenModal',
            contentStyle: { backgroundColor: colors.background },
          }}
        />

        {/* The detail sheets, native so drag-to-dismiss costs no gesture dependency. */}
        <Stack.Screen
          name="entry/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.65, 0.95],
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        {/* Opened from inside the settings modal, which is the only sheet here that is. iOS
            presents it over the modal the same way it presents the others over the log. */}
        <Stack.Screen
          name="saved-meal/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.65, 0.95],
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="water"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.8],
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.background },
          }}
        />

        {/* The two the log screen opens. Both are short and of a known size, so they are
            drawn to their contents rather than to a fraction of the screen — and neither
            screen may fill its height, or it would ask for the whole screen.

            `surface`, not `background`: these two are the whole sheet rather than a page of
            blocks, so the sheet is the card. Drawing a card inside one is a layer floating
            on nothing. */}
        <Stack.Screen
          name="calendar"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <Stack.Screen
          name="summary"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: 'fitToContents',
            sheetGrabberVisible: true,
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
      </Stack>
    </SelectedDayProvider>
  );
}
