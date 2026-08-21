import { Keyboard, View } from 'react-native';

import { IconButton, Pill } from '@/shared/ui';
import { CalorieStat } from './calorie-stat';

/**
 * Replaces the summary bar while an entry is being written.
 *
 * It used to carry a mic, a camera and an add button as well. None of the three had an
 * `onPress`: they tinted when tapped, announced themselves to a screen reader as buttons,
 * and did nothing — three promises the app cannot keep. A control that looks live and is
 * not is worse than an absent one, because the person blames themselves for it.
 *
 * What is left is the two that work: the running calorie count, and a way out of the
 * keyboard.
 */
export function ComposerToolbar({ calories }: { calories: number }) {
  return (
    <View className="flex-row items-center gap-3">
      <Pill className="flex-1 justify-center px-6 py-3.5">
        <CalorieStat value={calories} />
      </Pill>

      <IconButton
        icon={{ family: 'material', name: 'keyboard-hide', className: 'text-foreground-muted' }}
        accessibilityLabel="Hide the keyboard"
        onPress={() => Keyboard.dismiss()}
      />
    </View>
  );
}
