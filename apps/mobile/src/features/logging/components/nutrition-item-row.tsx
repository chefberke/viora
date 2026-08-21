import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/shared/ui';
import type { CorrectionOpRequest, ItemSource, ParsedItem } from '@/shared/api-types';
import { MACROS } from '@/shared/macros';
import { FoodCandidateRow } from './food-candidate-row';
import { ItemPortionEditor } from './item-portion-editor';

const ROW_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * The database a row's numbers came from, short enough to sit under the food's name. Null
 * where naming one would be wrong: a model estimate says so in its own words, and water
 * has no figures to attribute. Exhaustive, so a third database cannot arrive unnamed.
 */
const SOURCE_NAME: Record<ItemSource, string | null> = {
  usda: 'USDA',
  off: 'Open Food Facts',
  llm_estimate: null,
  water: null,
};

/** What the row credits under the food's name, or null when there is nothing to credit. */
function sourceLine(item: ParsedItem): string | null {
  const database = SOURCE_NAME[item.source] ?? null;

  return database === null || item.matchedDescription === null
    ? null
    : `${database} · ${item.matchedDescription}`;
}

/** How the portion is written: whichever measure the parse had for it. */
function portionLabel(item: ParsedItem): string {
  if (item.ml !== null) {
    return `${item.ml} ml`;
  }

  return item.grams !== null ? `${item.grams} g` : `${item.quantity} ${item.unit}`;
}

export interface NutritionItemRowProps {
  item: ParsedItem;
  /** Its place in the stored parse. Every correction is a sentence about this number. */
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onCorrect: (op: CorrectionOpRequest) => void;
  /** None of the candidates were the food: hand this item to the search. */
  onSearchFood: () => void;
  /** A correction for this row is in the post. */
  isBusy: boolean;
}

/**
 * One food of an entry, with its macros and its corrections folded under it.
 *
 * The sheet's card at the top says what the whole entry came to; a row here says the same
 * three numbers for one food, in the same order and the same colours, so the split reads
 * as the card again rather than as a second kind of thing. Closed, the row is what it was:
 * the food and its calories. The chevron, and a marker when the parse would like a person
 * to look, are the only things added to it.
 *
 * Open, it is where the parse is argued with. The rows that lost are on the item already —
 * the parse put them there — so choosing between them costs no request and no wait, and the
 * calories beside each one say what choosing it would do.
 *
 * The drawer animates its height with the contents pinned to the top of the clip, so they
 * are already in place as the row opens instead of walking down with it.
 */
export function NutritionItemRow({
  item,
  index,
  isOpen,
  onToggle,
  onCorrect,
  onSearchFood,
  isBusy,
}: NutritionItemRowProps) {
  const [height, setHeight] = useState(0);
  const [isPicking, setIsPicking] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, ROW_TIMING);
  }, [isOpen, progress]);

  // A closed row has nothing to pick from. Reopening it starts on the macros again.
  useEffect(() => {
    if (!isOpen) {
      setIsPicking(false);
    }
  }, [isOpen]);

  // Inline, not classes: `Animated.View` takes its styling through `style` here.
  const clipStyle = useAnimatedStyle(() => ({ height: progress.value * height }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  const credit = sourceLine(item);
  const grams = item.grams ?? item.ml ?? 0;
  const marked = item.needsReview && !item.corrected;

  return (
    <View className="bg-surface">
      <Pressable
        className="flex-row items-center justify-between px-5 py-4 active:bg-surface-strong"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.calories} calories${
          marked ? ', worth a look' : item.corrected ? ', corrected by you' : ''
        }`}
        accessibilityHint={isOpen ? 'Hides the details' : 'Shows the macros and the corrections'}
        accessibilityState={{ expanded: isOpen }}
      >
        <View className="flex-1 gap-0.5 pr-3">
          <View className="flex-row items-center gap-1.5">
            {/* Only ever on a row the parse itself was unsure of. Marking every row marks none. */}
            {marked ? (
              <Icon name="alert-circle-outline" size={15} className="text-warning" />
            ) : null}
            <Text className="text-base text-foreground">
              {item.name} <Text className="text-foreground-muted">({portionLabel(item)})</Text>
            </Text>
          </View>
          {item.corrected ? (
            <Text className="text-xs text-foreground-subtle">Corrected by you</Text>
          ) : item.source === 'llm_estimate' ? (
            <Text className="text-xs text-warning">estimate — no database match</Text>
          ) : credit !== null ? (
            <Text className="text-xs text-foreground-subtle" numberOfLines={1}>
              {credit}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <Text className="text-base text-foreground-muted">{item.calories} cal</Text>
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={16} className="text-foreground-subtle" />
          </Animated.View>
        </View>
      </Pressable>

      {/* The drawer holds buttons now, so it has to accept a touch — but only while it is
          open, or a closed row would swallow taps meant for the row below it. */}
      <Animated.View
        style={[{ overflow: 'hidden' }, clipStyle]}
        pointerEvents={isOpen ? 'auto' : 'none'}
        aria-hidden={!isOpen}
      >
        {/* Held to the top of the clip, which is the edge that stays still. */}
        <View
          className="absolute left-0 right-0 top-0 gap-4 px-5 pb-4"
          onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
        >
          <View className="flex-row justify-around">
            {MACROS.map((macro) => (
              <View key={macro.key} className="items-center gap-0.5">
                <Text className="text-lg font-semibold text-foreground">{item[macro.key]} g</Text>
                <Text className={`text-sm ${macro.colorClassName}`}>{macro.name}</Text>
              </View>
            ))}
          </View>

          {/* Water has one composition and no database was asked for it: only the volume
              here can be wrong, so only the volume is offered. */}
          <ItemPortionEditor
            item={item}
            disabled={isBusy}
            onChange={(quantity) =>
              onCorrect({ type: 'set_portion', itemIndex: index, quantity, unit: item.unit })
            }
          />

          {isPicking ? (
            <View className="gap-2">
              <Text className="text-xs font-medium text-foreground-muted">Which one was it?</Text>

              {item.candidates.map((candidate, candidateIndex) => (
                <FoodCandidateRow
                  key={`${candidate.provider}-${candidate.id}`}
                  candidate={candidate}
                  grams={grams}
                  isSelected={false}
                  disabled={isBusy}
                  onPress={() => {
                    setIsPicking(false);
                    onCorrect({ type: 'pick_candidate', itemIndex: index, candidateIndex });
                  }}
                />
              ))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Search for another food"
                onPress={() => {
                  setIsPicking(false);
                  onSearchFood();
                }}
                hitSlop={6}
                className="px-1 py-1"
              >
                <Text className="text-[15px] text-brand">
                  {item.candidates.length === 0
                    ? 'Nothing else was offered — search instead'
                    : 'None of these — search instead'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="flex-row items-center gap-5">
              {/* Water is priced from no database row, so there is nothing to change it to —
                  only how much of it there was, and whether it belongs here at all. */}
              {item.kind === 'water' ? null : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change the food this row was priced from"
                  accessibilityState={{ disabled: isBusy }}
                  disabled={isBusy}
                  onPress={() => setIsPicking(true)}
                  hitSlop={6}
                >
                  <Text className={`text-[15px] text-brand ${isBusy ? 'opacity-50' : ''}`}>
                    Change food
                  </Text>
                </Pressable>
              )}

              {/* Said plainly, with no dialog in the way — the same bargain every other
                  destructive word in this app makes. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name} from this entry`}
                accessibilityState={{ disabled: isBusy }}
                disabled={isBusy}
                onPress={() => onCorrect({ type: 'remove_item', itemIndex: index })}
                hitSlop={6}
              >
                <Text className={`text-[15px] text-danger ${isBusy ? 'opacity-50' : ''}`}>
                  Remove
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}
