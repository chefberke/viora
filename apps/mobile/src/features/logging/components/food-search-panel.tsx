import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { messageForError } from '@/shared/lib';
import { Icon } from '@/shared/ui';
import type { ItemCandidate } from '@/shared/api-types';
import { useTheme } from '@/theme';
import { foodSearchKey, searchFoods } from '../api';
import { FoodCandidateRow } from './food-candidate-row';

/** The server refuses anything shorter, and one letter matches most of a food database anyway. */
const MIN_QUERY = 2;

/** A keystroke is not a search. Long enough that a typed word goes over the wire once. */
const SEARCH_DEBOUNCE_MS = 400;

export interface FoodSearchPanelProps {
  /** What the item is called now — the search starts there rather than on an empty field. */
  initialQuery: string;
  /** The weight the results are priced at, so a row shows what choosing it would log. */
  grams: number;
  disabled: boolean;
  onPick: (food: ItemCandidate) => void;
  onBack: () => void;
}

/**
 * Searching the food databases for a row the parse never offered.
 *
 * It replaces the sheet's body rather than opening anything: this screen is already a sheet,
 * and a second presentation on top of one is a shape the app does not use anywhere.
 *
 * The results are the same rows the parser itself ranks, through the same lookup and the
 * same cache — so a food chosen here is a food the parser could have chosen, and the
 * correction it produces is a fair verdict on the parser's own ranking rather than on a
 * different search nobody else uses.
 */
export function FoodSearchPanel({
  initialQuery,
  grams,
  disabled,
  onPick,
  onBack,
}: FoodSearchPanelProps) {
  const { colors } = useTheme();
  const [text, setText] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  const isSearchable = query.length >= MIN_QUERY;
  const { data, error, isFetching, isError, refetch } = useQuery({
    queryKey: foodSearchKey(query),
    queryFn: () => searchFoods(query),
    // Below the server's own floor the request is a guaranteed 400, and the client retries
    // once, so an ungated field would spend two refusals on every first keystroke.
    enabled: isSearchable,
    staleTime: 5 * 60 * 1000,
  });

  const foods = data?.foods ?? [];

  return (
    // One scroller, exactly the shape the sheet's own body uses — a `View` root with a
    // flexed list inside it gets no bounded height from the native sheet, and the list ends
    // up drawn over the field above it. The header scrolling away with the results is the
    // price, and a search that is being read rather than typed does not need it pinned.
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-5 pb-10 pt-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to the items"
        >
          <Icon name="chevron-back" size={22} className="text-foreground-muted" />
        </Pressable>
        <Text className="text-xl font-semibold text-foreground">Find the food</Text>
      </View>

      <TextInput
        className="h-12 rounded-2xl border border-border bg-surface px-4 text-[17px] text-foreground"
        value={text}
        onChangeText={setText}
        autoFocus
        autoCorrect={false}
        returnKeyType="search"
        placeholder="Search USDA and Open Food Facts"
        placeholderTextColor={colors['foreground-muted']}
        selectionColor={colors.brand}
        accessibilityLabel="Search for a food"
      />

      {!isSearchable ? (
        <Text className="text-[15px] text-foreground-subtle">
          Type at least two letters to search.
        </Text>
      ) : isFetching && foods.length === 0 ? (
        <ActivityIndicator color={colors['foreground-subtle']} />
      ) : isError ? (
        // The only error state in the app that offered nothing to do about it. The copy is
        // the shared one, so a rate limit here reads the same as a rate limit anywhere, and
        // the retry appears only when retrying could actually change the answer.
        <View className="gap-2">
          <Text className="text-[15px] text-danger">{messageForError(error).message}</Text>
          {messageForError(error).retry ? (
            <Pressable
              onPress={() => void refetch()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Search again"
            >
              <Text className="text-[15px] text-accent">Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : foods.length === 0 ? (
        <Text className="text-[15px] text-foreground-subtle">
          Nothing matched “{query}”. Try the food&apos;s plain English name.
        </Text>
      ) : (
        foods.map((food) => (
          <FoodCandidateRow
            key={`${food.provider}-${food.id}`}
            candidate={food}
            grams={grams}
            isSelected={false}
            disabled={disabled}
            onPress={() => onPick(food)}
          />
        ))
      )}
    </ScrollView>
  );
}
