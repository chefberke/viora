import { Stack } from 'expo-router';

import { SelectedDayProvider } from '@/features/logging';
import { useTheme } from '@/theme';

// Names the screen under the modal. Without it, a deep link straight to `/settings`
// opens it as the first screen in the stack, with nothing behind it.
export const unstable_settings = { anchor: 'index' };

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
