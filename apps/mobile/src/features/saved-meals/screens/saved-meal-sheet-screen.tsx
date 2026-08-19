import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CALORIE_GLYPH, MACROS } from '@/shared/macros';
import { IconButton, ShimmerText } from '@/shared/ui';
import { useTheme } from '@/theme';
import { BookmarkButton } from '../components/bookmark-button';
import { useSavedMeals } from '../use-saved-meals';

/**
 * How long the wording rests before it is read again. The same beat the composer gives a row,
 * because this is the same act: writing a meal and letting the figures catch up.
 */
const COMMIT_MS = 1000;

/**
 * A number in the card. While the wording is being read again it shimmers instead of sitting
 * still, which is the app's own way of saying a figure is being worked out — the same sweep
 * the composer's rows wear while they parse.
 */
function Figure({ text, textClassName, working }: {
  text: string;
  textClassName: string;
  working: boolean;
}) {
  const { colors } = useTheme();

  if (!working) {
    return <Text className={`${textClassName} text-foreground`}>{text}</Text>;
  }

  return (
    <ShimmerText
      text={text}
      base={colors['foreground-muted']}
      highlight={colors.foreground}
      textClassName={textClassName}
    />
  );
}

export interface SavedMealSheetScreenProps {
  id: string;
}

/**
 * One saved meal, behind its row in settings.
 *
 * A sheet rather than a field in the list, for the reason the log works this way too: a row
 * is a thing to recognise at a glance, and turning it into an input under the thumb is a
 * worse place to read from and a worse place to write in. Tapping a saved meal opens it the
 * same way tapping an entry's calories opens its nutrition.
 *
 * The wording is simply written on, with no button to press: it rests, it is read again, and
 * the whole card below shimmers while that happens. A saved meal is only as good as the line
 * it holds, so changing that line is the ordinary thing to do here, not a mode to enter.
 */
export function SavedMealSheetScreen({ id }: SavedMealSheetScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { savedMeals, isLoaded, edit, remove, isSaving } = useSavedMeals();

  const meal = savedMeals.find((item) => item.id === id);
  const totals = meal?.result?.totals;

  // Null until the wording is touched, and its own truth from then on. It is never handed
  // back to the server's copy: that copy trails the parse, so falling back to it mid-save
  // would flick the old line into the field and out again.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? meal?.text ?? '';

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Rebuilt every render so the timer below always fires against the current wording, without
  // the wording having to be a dependency of anything.
  const commit = useRef(() => {});

  commit.current = () => {
    const next = shown.trim();

    if (next === '' || meal === undefined || next === meal.text) {
      return;
    }

    void edit(id, next)
      .then((landedOn) => {
        // An edit that turns this meal into one already saved merges the two, and the row
        // this sheet was opened on is gone. Nothing is left here to look at, so it closes.
        if (landedOn !== id && mounted.current) {
          router.back();
        }
      })
      .catch(() => {
        // The line could not be read. The wording stays in the field, so it can be tried
        // again by touching it; the figures below are still the ones that match the old line.
      });
  };

  // A sheet dragged away mid-edit still saves what was written. Nothing navigates from here:
  // by now the sheet is gone, and `router.back()` would take the settings modal with it.
  useEffect(
    () => () => {
      mounted.current = false;

      if (timer.current !== null) {
        clearTimeout(timer.current);
      }

      commit.current();
    },
    [],
  );

  function handleChangeText(next: string) {
    setDraft(next);

    if (timer.current !== null) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => commit.current(), COMMIT_MS);
  }

  function handleBlur() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    commit.current();
  }

  function removeMeal() {
    // Closed first, so the sheet is not left reading a meal that has gone. A failure leaves
    // the meal where it was, and the list behind still shows it.
    router.back();
    void remove(id).catch(() => {});
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-5 pb-10 pt-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xl font-semibold text-foreground">Saved Meal</Text>

        {/* Grouped, not spread: `justify-between` would push the two buttons to either end. */}
        <View className="flex-row items-center gap-2">
          {meal ? <BookmarkButton isSaved onPress={removeMeal} /> : null}
          <IconButton
            icon={{ name: 'close', className: 'text-foreground-muted' }}
            accessibilityLabel="Close"
            onPress={() => router.back()}
          />
        </View>
      </View>

      {!meal ? (
        <Text className="text-base text-foreground-muted">
          {isLoaded ? 'This meal is gone.' : ' '}
        </Text>
      ) : (
        <>
          {/* The title is the field. `p-0` because Android hands a TextInput its theme's own
              padding, which would set the line off from everything under it. */}
          <TextInput
            className="p-0 text-3xl font-bold text-foreground"
            value={shown}
            onChangeText={handleChangeText}
            onBlur={handleBlur}
            accessibilityLabel="Meal wording"
            selectionColor={colors['action-voice']}
            // Wraps instead of scrolling sideways; the sheet's ScrollView owns scrolling.
            multiline
            scrollEnabled={false}
          />

          <View className="items-center gap-4 rounded-3xl bg-surface p-6">
            <View className="items-center gap-0.5">
              {/* The flame stays out of the shimmer: a mask reads alpha, so the sweep would
                  paint over the emoji's own colours and leave a grey flame. */}
              <View className="flex-row items-center gap-2">
                <Text className="text-4xl font-bold text-foreground">{CALORIE_GLYPH}</Text>
                <Figure
                  text={String(totals?.calories ?? 0)}
                  textClassName="text-4xl font-bold"
                  working={isSaving}
                />
              </View>
              <Text className="text-base text-foreground-muted">total calories</Text>
            </View>

            <View className="w-full flex-row justify-around">
              {MACROS.map((macro) => (
                <View key={macro.key} className="items-center gap-0.5">
                  <Figure
                    text={`${totals?.[macro.key] ?? 0} g`}
                    textClassName="text-lg font-semibold"
                    working={isSaving}
                  />
                  <Text className={`text-sm ${macro.colorClassName}`}>{macro.name}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}
