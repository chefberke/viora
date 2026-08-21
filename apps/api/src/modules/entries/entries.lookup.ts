/**
 * One food name, resolved against one provider: from the cache when possible, over the
 * network when not, and never at all when the rate budget says no.
 *
 * It sits apart from the pipeline because the pipeline is not the only caller any more.
 * The food search a correction offers has to go through exactly the same door — same cache
 * keys, same budget, same reading of what a null means — or the two would drift into
 * separate opinions about which foods exist.
 */
import { getCachedFood, setCachedFood } from './entries.cache.ts';
import type { FoodMatch, FoodProvider, SearchFood } from './entries.types.ts';

export interface FoodLookup {
  /** Ranked on the words alone, best first. Empty when the provider holds nothing. */
  candidates: FoodMatch[];
  cacheHit: boolean;
  /**
   * True when the rate budget stopped the call before it was made. It is not an answer,
   * so it is never written to the cache: doing so would blacklist the food for a day.
   */
  skipped: boolean;
  /**
   * True when the provider was asked and could not answer. Distinct from an empty list in
   * the one way that matters: "there is no such food" is a claim, and an outage makes none.
   */
  unreachable: boolean;
}

/**
 * One name resolved against one provider: from the cache when possible. `language` is
 * part of the cache key only for a provider whose answer depends on it.
 */
export async function resolveFrom(
  provider: FoodProvider,
  query: string,
  language: string,
  search: SearchFood,
  useCache: boolean,
  takeSlot?: () => boolean | Promise<boolean>,
): Promise<FoodLookup> {
  const scope = provider === 'off' ? language : '';
  const cached = useCache ? await getCachedFood(provider, query, scope) : null;

  if (cached === 'miss') {
    return { candidates: [], cacheHit: true, skipped: false, unreachable: false };
  }

  if (cached !== null) {
    return { candidates: cached, cacheHit: true, skipped: false, unreachable: false };
  }

  // Checked after the cache, so a name we already know costs no budget.
  if (takeSlot !== undefined && !(await takeSlot())) {
    return { candidates: [], cacheHit: false, skipped: true, unreachable: false };
  }

  const candidates = await search(query, language);

  // Null is the provider being unreachable, and an outage is not an answer. Writing it
  // down would blacklist the food for a day over a blip that lasted seconds — which is
  // what this code used to do, because the provider collapsed "no match" and "no answer"
  // into the same null before it returned a list.
  if (useCache && candidates !== null) {
    await setCachedFood(provider, query, candidates, scope);
  }

  return {
    candidates: candidates ?? [],
    cacheHit: false,
    skipped: false,
    unreachable: candidates === null,
  };
}
