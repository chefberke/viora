/** Request guards for the food search. Nothing here touches the database. */
import { badRequest } from '../../utils/index.ts';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 64;
/** ISO 639-1: two letters, and nothing else is a language as far as this API is concerned. */
const LANGUAGE_PATTERN = /^[a-z]{2}$/i;

export interface FoodSearchQuery {
  q: string;
  /** The line's language, for the provider that indexes by it. Empty means unknown. */
  language: string;
}

export function parseFoodSearchQuery(query: Record<string, unknown>): FoodSearchQuery {
  const q = typeof query.q === 'string' ? query.q.trim() : '';

  if (q.length < MIN_QUERY_LENGTH || q.length > MAX_QUERY_LENGTH) {
    throw badRequest('invalid_query');
  }

  const language = typeof query.lang === 'string' ? query.lang.trim().toLowerCase() : '';

  return { q, language: LANGUAGE_PATTERN.test(language) ? language : '' };
}
