import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/shared/ui';
import type { ParsedItem } from '@/shared/api-types';
import { MACROS } from '@/shared/macros';

const ROW_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };

/** How the portion is written: whichever measure the parse had for it. */
function portionLabel(item: ParsedItem): string {
  if (item.ml !== null) {
    return `${item.ml} ml`;
  }

  return item.grams !== null ? `${item.grams} g` : `${item.quantity} ${item.unit}`;
}

export interface NutritionItemRowProps {
  item: ParsedItem;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * One food of an entry, with its own macros folded under it.
 *
 * The sheet's card at the top says what the whole entry came to; a row here says the same
 * three numbers for one food, in the same order and the same colours, so the split reads
 * as the card again rather than as a second kind of thing. Closed, the row is what it was:
 * the food and its calories. The chevron is the only thing added to it.
 *
 * The drawer animates its height with the macros pinned to the top of the clip, so they
 * are already in place as the row opens instead of walking down with it.
 */
export function NutritionItemRow({ item, isOpen, onToggle }: NutritionItemRowProps) {
  const [height, setHeight] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, ROW_TIMING);
  }, [isOpen, progress]);

  // Inline, not classes: `Animated.View` takes its styling through `style` here.
  const clipStyle = useAnimatedStyle(() => ({ height: progress.value * height }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <View className="bg-surface">
      <Pressable
        className="flex-row items-center justify-between px-5 py-4 active:bg-surface-strong"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.calories} calories`}
        accessibilityHint={isOpen ? 'Hides the macros' : 'Shows the macros'}
        accessibilityState={{ expanded: isOpen }}
      >
        <View className="flex-1 gap-0.5 pr-3">
          <Text className="text-base text-foreground">
            {item.name} <Text className="text-foreground-muted">({portionLabel(item)})</Text>
          </Text>
          {item.source === 'llm_estimate' ? (
            <Text className="text-xs text-warning">estimate — no database match</Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <Text className="text-base text-foreground-muted">{item.calories} cal</Text>
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={16} className="text-foreground-subtle" />
          </Animated.View>
        </View>
      </Pressable>

      <Animated.View
        style={[{ overflow: 'hidden' }, clipStyle]}
        pointerEvents="none"
        aria-hidden={!isOpen}
      >
        {/* Held to the top of the clip, which is the edge that stays still. */}
        <View
          className="absolute left-0 right-0 top-0 flex-row justify-around px-5 pb-4"
          onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
        >
          {MACROS.map((macro) => (
            <View key={macro.key} className="items-center gap-0.5">
              <Text className="text-lg font-semibold text-foreground">{item[macro.key]} g</Text>
              <Text className={`text-sm ${macro.colorClassName}`}>{macro.name}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
