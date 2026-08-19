import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

// Names the screen under the modal. Without it, a deep link straight to `/settings`
// opens it as the first screen in the stack, with nothing behind it.
export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  // The modal background follows the chosen theme, not the device one.
  const { colors } = useTheme();

  return (
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
    </Stack>
  );
}
