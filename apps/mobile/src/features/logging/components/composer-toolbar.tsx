import { Keyboard, View } from 'react-native';

import { IconButton, Pill } from '@/shared/ui';
import { CalorieStat } from './calorie-stat';

/** Replaces the summary bar while an entry is being written. */
export function ComposerToolbar({ calories }: { calories: number }) {
  return (
    <View className="flex-row items-center gap-3">
      <Pill className="flex-1 justify-center px-6 py-3.5">
        <CalorieStat value={calories} />
      </Pill>

      <IconButton
        icon={{ name: 'mic', className: 'text-action-voice' }}
        accessibilityLabel="Log by voice"
      />
      <IconButton
        icon={{ name: 'camera', className: 'text-action-camera' }}
        accessibilityLabel="Log with a photo"
      />
      <IconButton
        icon={{ name: 'add', size: 26, className: 'text-action-add' }}
        accessibilityLabel="Add"
      />
      <IconButton
        icon={{ family: 'material', name: 'keyboard-hide', className: 'text-foreground-muted' }}
        accessibilityLabel="Hide the keyboard"
        onPress={() => Keyboard.dismiss()}
      />
    </View>
  );
}
