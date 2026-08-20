import { env } from '../../config/index.ts';
import { cacheGet, cacheSet } from '../../lib/redis.ts';
import { sha256 } from '../../utils/index.ts';
import { normalizeInput } from './entries.text.ts';
import type { FoodMatch, FoodProvider, LlmParse, Nutrition100g } from './entries.types.ts';
import { FOOD_KEY_VERSION, PROMPT_FINGERPRINT, PROMPT_VERSION } from './entries.versions.ts';

const PARSE_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const FOOD_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const FOOD_MISS_TTL_SECONDS = 24 * 3600; // 1 day

/** Stored under a food key that searched and found nothing, so misses are cached too. */
const FOOD_MISS = 'miss';

/** Prompt and model are part of the key: neither changing must serve a stale parse. */
function parseKey(rawText: string): string {
  const prompt = `${PROMPT_VERSION}.${PROMPT_FINGERPRINT}`;

  return `viora:parse:${prompt}:${env.LLM_MODEL}:${sha256(normalizeInput(rawText))}`;
}

/**
 * The provider name is part of the key, not a field inside the value: two databases
 * answering the same string are two different answers. `scope` is anything else that
 * changes the answer for the same string — the language Open Food Facts was searched in.
 */
function foodKey(provider: FoodProvider, query: string, scope: string): string {
  const subject = scope === '' ? query : `${scope}|${query}`;

  return `viora:${provider}:${FOOD_KEY_VERSION[provider]}:${sha256(normalizeInput(subject))}`;
}

function readNutrition(value: unknown): Nutrition100g | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const read = (key: string): number | null => {
    const raw = record[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  };

  const kcal = read('kcal');
  const protein = read('protein');
  const carbs = read('carbs');
  const fat = read('fat');

  if (kcal === null || protein === null || carbs === null || fat === null) {
    return null;
  }

  return { kcal, protein, carbs, fat };
}

/** A cached entry read back as a `FoodMatch`, or null when the stored value is not one. */
function toFoodMatch(raw: unknown): FoodMatch | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const per100g = readNutrition(record.per100g);
  const description = typeof record.description === 'string' ? record.description : '';
  const provider = record.provider;
  const id = record.id;
  const matchScore = record.matchScore;
  const rank = record.rank;

  if (
    per100g === null ||
    description === '' ||
    (provider !== 'usda' && provider !== 'off') ||
    typeof id !== 'string' ||
    typeof matchScore !== 'number' ||
    !Number.isFinite(matchScore) ||
    typeof rank !== 'number' ||
    !Number.isFinite(rank)
  ) {
    return null;
  }

  return {
    provider,
    id,
    description,
    detail: typeof record.detail === 'string' ? record.detail : '',
    per100g,
    matchScore,
    rank,
  };
}

export async function getCachedParse(rawText: string): Promise<LlmParse | null> {
  const hit = await cacheGet(parseKey(rawText));

  if (hit === null) {
    return null;
  }

  try {
    return JSON.parse(hit) as LlmParse;
  } catch {
    return null;
  }
}

export async function setCachedParse(rawText: string, parse: LlmParse): Promise<void> {
  await cacheSet(parseKey(rawText), JSON.stringify(parse), PARSE_TTL_SECONDS);
}

/** `null` = not cached; `'miss'` = cached "this provider has no match"; else the match. */
export async function getCachedFood(
  provider: FoodProvider,
  query: string,
  scope = '',
): Promise<FoodMatch | 'miss' | null> {
  const hit = await cacheGet(foodKey(provider, query, scope));

  if (hit === null) {
    return null;
  }

  if (hit === FOOD_MISS) {
    return FOOD_MISS;
  }

  try {
    return toFoodMatch(JSON.parse(hit));
  } catch {
    return null;
  }
}

/**
 * Only ever called for a lookup that actually ran. A lookup the rate budget skipped must
 * never come through here: it would be stored as a day-long "no match" for a food nobody
 * ever asked the database about.
 */
export async function setCachedFood(
  provider: FoodProvider,
  query: string,
  match: FoodMatch | null,
  scope = '',
): Promise<void> {
  if (match === null) {
    // Short TTL: "no match" may just mean the provider was briefly down.
    await cacheSet(foodKey(provider, query, scope), FOOD_MISS, FOOD_MISS_TTL_SECONDS);
    return;
  }

  await cacheSet(foodKey(provider, query, scope), JSON.stringify(match), FOOD_TTL_SECONDS);
}
