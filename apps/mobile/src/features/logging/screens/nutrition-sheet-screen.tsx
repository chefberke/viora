import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { BookmarkButton, useSavedMeals } from '@/features/saved-meals';
import { Icon, SheetScreen } from '@/shared/ui';
import { useTheme } from '@/theme';
import { entriesDayKey, fetchEntriesByDay } from '../api';
import type { CorrectionOpRequest, ParseSource } from '@/shared/api-types';
import { toDayNumber } from '../calendar';
import { CALORIE_GLYPH, MACROS } from '@/shared/macros';
import { CONFIDENCE } from '../constants';
import { useToday } from '../use-today';
import { useItemCorrections } from '../use-item-corrections';
import { FoodSearchPanel } from '../components/food-search-panel';
import { NutritionItemRow } from '../components/nutrition-item-row';
import { ProgressRing } from '../components/progress-ring';

/**
 * What the sheet is showing. A swap rather than a second screen: this is already a sheet,
 * and the app presents nothing on top of one.
 */
type SheetView = { kind: 'items' } | { kind: 'search'; itemIndex: number };

/**
 * A `Record` rather than a chain of checks: the compiler then refuses to build once a
 * third database is added and this list has not grown with it. Getting that wrong is how
 * a real reference ends up labelled as a guess.
 */
const SOURCE_LABEL: Record<ParseSource['kind'], (source: ParseSource) => string> = {
  usda: (source) =>
    source.sourceId === null
      ? 'USDA FoodData Central'
      : `USDA FoodData Central #${source.sourceId}`,
  off: (source) =>
    source.sourceId === null ? 'Open Food Facts' : `Open Food Facts · ${source.sourceId}`,
  llm: () => 'Language-model estimate',
};

function describeSource(source: ParseSource): string {
  return SOURCE_LABEL[source.kind](source);
}

export interface NutritionSheetScreenProps {
  id: string;
  /** The day the row was opened from. Today when the route carried none. */
  day?: number;
}

/** The bottom sheet behind a food row's calorie label. */
export function NutritionSheetScreen({ id, day }: NutritionSheetScreenProps) {
  const { colors } = useTheme();
  const today = useToday();
  const shownDay = day ?? toDayNumber(today);
  // Which item drawers are open, by index. Several may be, so two foods can be compared.
  const [openItems, setOpenItems] = useState<ReadonlySet<number>>(() => new Set());
  const [view, setView] = useState<SheetView>({ kind: 'items' });

  const toggleItem = useCallback((index: number) => {
    setOpenItems((open) => {
      const next = new Set(open);

      if (!next.delete(index)) {
        next.add(index);
      }

      return next;
    });
  }, []);

  const openItem = useCallback((index: number) => {
    setOpenItems((open) => new Set(open).add(index));
  }, []);

  const { data } = useQuery({
    queryKey: entriesDayKey(shownDay),
    queryFn: () => fetchEntriesByDay(shownDay),
  });

  const entry = data?.entries.find((item) => item.id === id);
  const result = entry?.result;

  // Whether this line is bookmarked is read off the saved list rather than carried on the
  // entry: the list is small and already cached, and a bookmark belongs to the wording, not
  // to one particular row of one particular day.
  const { find, toggle, isSaving } = useSavedMeals();
  const saved = entry ? find(entry.rawText) : undefined;

  const { correct, busyIndex, error, dismissError } = useItemCorrections(entry, shownDay);

  const applyOp = useCallback(
    (op: CorrectionOpRequest) => {
      // Removing a row renumbers everything under it, so the open set no longer describes the
      // list it was written about. Closing them all is the only honest thing to do with it.
      if (op.type === 'remove_item') {
        setOpenItems(new Set());
      }

      void correct(op);
    },
    [correct],
  );

  // The first row the parse itself was unsure about — where "something off?" should land.
  const firstUnsure = result?.items.findIndex((item) => item.needsReview && !item.corrected) ?? -1;

  const searching = view.kind === 'search' ? result?.items[view.itemIndex] : undefined;

  // The whole body swaps, so the search has the sheet's height to work in and the keyboard
  // is not fighting a list of macros for room.
  if (view.kind === 'search' && searching !== undefined) {
    // Returned bare, with no wrapper: the panel is the whole screen here, and every extra
    // flex level between it and the sheet is another chance for its list to be laid out
    // against the wrong box.
    return (
      <FoodSearchPanel
        initialQuery={searching.name}
        grams={searching.grams ?? searching.ml ?? 0}
        disabled={busyIndex !== null}
        onBack={() => setView({ kind: 'items' })}
        onPick={(food) => {
          setView({ kind: 'items' });
          applyOp({ type: 'set_food', itemIndex: view.itemIndex, food });
        }}
      />
    );
  }

  return (
    <SheetScreen
      title="Nutrition Details"
      headerAccessory={
        /* Nothing to save from an entry with no parse — the sheet has no figures to show
           for it either, so the button keeps the same company as the body below. */
        entry && result ? (
          <BookmarkButton
            isSaved={saved !== undefined}
            disabled={isSaving}
            onPress={() => {
              void toggle({ text: entry.rawText, result, sourceEntryId: entry.id });
            }}
          />
        ) : null
      }
    >

      {!entry || !result ? (
        <Text className="text-base text-foreground-muted">This entry is gone.</Text>
      ) : (
        <>
          <Text className="text-3xl font-bold text-foreground">{entry.rawText}</Text>

          <View className="items-center gap-4 rounded-3xl bg-surface p-6">
            <Text className="text-foreground">
              <Text className="text-4xl font-bold">
                {CALORIE_GLYPH} {result.totals.calories}
              </Text>
              <Text className="text-base text-foreground-muted">  total calories</Text>
            </Text>

            <View className="w-full flex-row justify-around">
              {MACROS.map((macro) => (
                <View key={macro.key} className="items-center gap-0.5">
                  <Text className="text-lg font-semibold text-foreground">
                    {result.totals[macro.key]} g
                  </Text>
                  <Text className={`text-sm ${macro.colorClassName}`}>{macro.name}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* A correction that did not land has to say so. The row it was aimed at is still
              on screen showing the old figures, and silence there reads as "it worked". */}
          {error !== null ? (
            <Pressable
              onPress={dismissError}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              className="flex-row items-center gap-2 rounded-2xl bg-surface px-4 py-3"
            >
              <Icon name="alert-circle-outline" size={18} className="text-danger" />
              <Text className="flex-1 text-[15px] text-foreground">{error.message}</Text>
            </Pressable>
          ) : null}

          <View className="gap-2">
            <Text className="text-base font-medium text-foreground-muted">Items</Text>
            <View className="gap-px overflow-hidden rounded-3xl">
              {result.items.map((item, index) => (
                <NutritionItemRow
                  key={`${item.name}-${index}`}
                  item={item}
                  index={index}
                  isOpen={openItems.has(index)}
                  onToggle={() => toggleItem(index)}
                  onCorrect={applyOp}
                  onSearchFood={() => setView({ kind: 'search', itemIndex: index })}
                  isBusy={busyIndex === index}
                />
              ))}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-base font-medium text-foreground-muted">Thought process</Text>
            <View className="gap-4 rounded-3xl bg-surface p-5">
              <View className="flex-row items-center gap-4">
                <ProgressRing
                  size={56}
                  strokeWidth={5}
                  progress={result.confidence}
                  color={colors[CONFIDENCE[result.confidenceLevel].token]}
                  trackColor={colors['surface-strong']}
                >
                  <Text className="text-sm font-semibold text-foreground">
                    {Math.round(result.confidence * 100)}
                  </Text>
                </ProgressRing>
                <View className="gap-0.5">
                  <Text className="text-sm text-foreground-muted">Confidence level</Text>
                  <Text
                    className={`text-lg font-semibold ${CONFIDENCE[result.confidenceLevel].className}`}
                  >
                    {CONFIDENCE[result.confidenceLevel].label}
                  </Text>
                </View>
              </View>

              {result.reasoning !== '' ? (
                <Text className="text-base leading-6 text-foreground">{result.reasoning}</Text>
              ) : null}

              {/* It used to dismiss the sheet, which handed the problem back to the person
                  who already said they had one. Now it opens the row the parse was least
                  sure of — and when it was sure of all of them, the first one. */}
              <Pressable
                onPress={() => openItem(firstUnsure === -1 ? 0 : firstUnsure)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Fix an item the parser got wrong"
              >
                <Text className="text-base text-brand">✎ Something off? Fix it above</Text>
              </Pressable>
            </View>
          </View>

          {result.sources.length > 0 ? (
            <View className="gap-2">
              <Text className="text-base font-medium text-foreground-muted">References</Text>
              <View className="gap-px overflow-hidden rounded-3xl">
                {result.sources.map((source, index) => (
                  <View key={`${source.title}-${index}`} className="bg-surface px-5 py-4">
                    <Text className="text-base text-foreground">{source.title}</Text>
                    <Text className="text-xs text-foreground-muted">
                      {describeSource(source)}
                    </Text>
                  </View>
                ))}
              </View>
              {result.sources.some((source) => source.kind === 'off') ? (
                <Text className="text-xs text-foreground-subtle">
                  Product data from Open Food Facts, under the Open Database License (ODbL).
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      )}
    </SheetScreen>
  );
}
