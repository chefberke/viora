import { useCallback, useMemo } from 'react';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ParseResult, SavedMealDto, SavedMealsResponse } from '@/shared/api-types';
import { deleteSavedMeal, fetchSavedMeals, saveMeal, savedMealsKey } from './api';
import { canonicalKey } from './key';

/** What a bookmark is made from: the line, and the parse it already had. */
export interface BookmarkInput {
  text: string;
  result: ParseResult | null;
  sourceEntryId?: string;
}

export interface UseSavedMealsResult {
  savedMeals: SavedMealDto[];
  /** Null while the list is still loading, so nothing renders a wrong count or a wrong state. */
  isLoaded: boolean;
  /** The saved meal matching this line, if there is one. */
  find: (text: string) => SavedMealDto | undefined;
  /** Save it if it is not saved, remove it if it is. Resolves once the server agrees. */
  toggle: (input: BookmarkInput) => Promise<void>;
  /**
   * Rewrite a saved meal's text. The server parses the new line and replaces the figures, and
   * hands back the row it landed on — which is not always the one asked for, since an edit
   * that collides with another saved meal merges into it. Resolves to that row's id.
   */
  edit: (id: string, text: string) => Promise<string>;
  remove: (id: string) => Promise<void>;
  /** True while an edit is being re-parsed, so the row can say so. */
  isSaving: boolean;
}

/**
 * The bookmarked meals. One query for the whole app: the list is small, it changes rarely,
 * and both the button in the nutrition sheet and the page in settings need the same answer
 * to "is this one saved".
 */
export function useSavedMeals(): UseSavedMealsResult {
  const queryClient = useQueryClient();

  const { data, isFetched } = useQuery({
    queryKey: savedMealsKey(),
    queryFn: fetchSavedMeals,
  });

  const savedMeals = useMemo(() => data?.savedMeals ?? [], [data]);

  // Keyed the way the server groups them, so a saved "2 Eggs." matches a logged "2 eggs".
  const byKey = useMemo(() => {
    const map = new Map<string, SavedMealDto>();

    for (const meal of savedMeals) {
      map.set(canonicalKey(meal.text), meal);
    }

    return map;
  }, [savedMeals]);

  const find = useCallback((text: string) => byKey.get(canonicalKey(text)), [byKey]);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: savedMealsKey() });
    // A bookmark is a suggestion in its own right, so the offered list is now out of date.
    void queryClient.invalidateQueries({ queryKey: ['suggestions'] });
  }, [queryClient]);

  /**
   * The cache work for both mutations lives inside their `mutationFn`, not in an `onSuccess`.
   * A sheet dragged away mid-save unmounts this hook, and React Query does not run an
   * unmounted observer's callbacks — but it does run the mutation function to the end. Put
   * the cache write there and an edit still lands in the list behind, whether or not the
   * screen that started it is still on screen. `queryClient` outlives all of them.
   */
  const save = useMutation({
    mutationFn: async ({ id, text, result, sourceEntryId }: BookmarkInput & { id: string }) => {
      const response = await saveMeal(id, { text, result, sourceEntryId: sourceEntryId ?? null });
      const { savedMeal } = response;

      // Written straight into the cache as well as invalidated: the bookmark button must not
      // flicker back to empty while the list is refetched under it.
      //
      // Both ids are dropped, not just the returned one: an edit that turns a meal into one
      // already saved merges the two, and the row that was asked for no longer exists.
      queryClient.setQueryData<SavedMealsResponse>(savedMealsKey(), (old) => ({
        savedMeals: [
          ...(old?.savedMeals ?? []).filter((meal) => meal.id !== savedMeal.id && meal.id !== id),
          savedMeal,
        ],
      }));
      invalidate();

      return response;
    },
  });

  const drop = useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteSavedMeal(id);

      queryClient.setQueryData<SavedMealsResponse>(savedMealsKey(), (old) => ({
        savedMeals: (old?.savedMeals ?? []).filter((meal) => meal.id !== id),
      }));
      invalidate();

      return response;
    },
  });

  const toggle = useCallback(
    async (input: BookmarkInput) => {
      const existing = find(input.text);

      if (existing) {
        await drop.mutateAsync(existing.id);
        return;
      }

      // Client-generated id, the same convention entries use: a retry stays one bookmark.
      await save.mutateAsync({ ...input, id: randomUUID() });
    },
    [drop, find, save],
  );

  const edit = useCallback(
    async (id: string, text: string) => {
      // No `result`: the text changed, so the figures have to be worked out again.
      const { savedMeal } = await save.mutateAsync({ id, text, result: null });

      return savedMeal.id;
    },
    [save],
  );

  const remove = useCallback(
    async (id: string) => {
      await drop.mutateAsync(id);
    },
    [drop],
  );

  return {
    savedMeals,
    isLoaded: isFetched,
    find,
    toggle,
    edit,
    remove,
    isSaving: save.isPending || drop.isPending,
  };
}
