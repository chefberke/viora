import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/shared/ui';
import { useLeaveSettings } from '../use-leave-settings';

/**
 * The pinned title row, held by the ScrollView's `stickyHeaderIndices` rather than by a
 * sibling above it — see the note in settings-screen.tsx. Its background is opaque
 * because the rows pass underneath. The close button is the only way out of the modal.
 */
export function SettingsHeader() {
  const leaveSettings = useLeaveSettings();
  // A full-screen modal covers the status bar, so the inset is ours to apply.
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-row items-center justify-between bg-background px-5 pb-3"
      style={{ paddingTop: insets.top + 8 }}
    >
      <Text className="text-[18px] font-semibold text-foreground">Settings</Text>

      <IconButton
        accessibilityLabel="Close settings"
        icon={{ name: 'close', className: 'text-foreground-muted' }}
        onPress={leaveSettings}
      />
    </View>
  );
}
