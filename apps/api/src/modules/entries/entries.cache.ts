import { env } from '../../config/index.ts';
import { cacheGet, cacheSet } from '../../lib/redis.ts';
import { sha256 } from '../../utils/index.ts';
import { normalizeInput } from './entries.text.ts';
import type { FoodMatch, FoodProvider, LlmParse, Nutrition100g } from './entries.types.ts';
import { validateLlmOutput } from './entries.llm-output.ts';
import {
  FOOD_KEY_VERSION,
  PARSE_CACHE_VERSION,
  PROMPT_FINGERPRINT,
  PROMPT_VERSION,
} from './entries.versions.ts';

const PARSE_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const FOOD_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const FOOD_MISS_TTL_SECONDS = 24 * 3600; // 1 day

/** Stored under a food key that searched and found nothing, so misses are cached too. */
const FOOD_MISS = 'miss';

/** Prompt and model are part of the key: neither changing must serve a stale parse. */
function parseKey(rawText: string): string {
  const prompt = `${PROMPT_VERSION}.${PROMPT_FINGERPRINT}`;

  return `viora:parse:${PARSE_CACHE_VERSION}:${prompt}:${env.LLM_MODEL}:${sha256(normalizeInput(rawText))}`;
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

/**
 * The model's stored answer, validated exactly as a fresh one is.
 *
 * The cache holds the raw generation rather than the parsed object, so this goes through
 * `validateLlmOutput` and there is only ever one thing that produces an `LlmParse`. The
 * food side has always validated what it read back; this side did a bare `JSON.parse` and
 * asserted the type, which meant anything that reached the key — a truncated write, a
 * value from a build whose output shape has since moved on — was trusted straight into
 * the pipeline. It also means a fix to the validator now reaches warm keys instead of
 * being shadowed by them for a week.
 *
 * A stored value that does not validate is reported as a miss, not as an error: the
 * honest recovery is to pay for the parse again.
 */
export async function getCachedParse(rawText: string): Promise<LlmParse | null> {
  const hit = await cacheGet(parseKey(rawText));

  if (hit === null) {
    return null;
  }

  try {
    return validateLlmOutput(hit);
  } catch {
    return null;
  }
}

export async function setCachedParse(rawText: string, raw: string): Promise<void> {
  await cacheSet(parseKey(rawText), raw, PARSE_TTL_SECONDS);
}

/**
 * `null` = not cached; `'miss'` = cached "this provider has no match"; else the ranked
 * candidates the provider returned.
 *
 * The whole list is stored, not the winner. The winner is not a property of the query any
 * more — the pipeline picks it using the model's estimate for the particular item — so
 * caching one row would freeze the first line's choice onto every later line that names
 * the same food. Any row in the stored list that fails to read back drops the entry: a
 * partially readable candidate list would silently narrow the choice.
 */
export async function getCachedFood(
  provider: FoodProvider,
  query: string,
  scope = '',
): Promise<FoodMatch[] | 'miss' | null> {
  const hit = await cacheGet(foodKey(provider, query, scope));

  if (hit === null) {
    return null;
  }

  if (hit === FOOD_MISS) {
    return FOOD_MISS;
  }

  try {
    const stored: unknown = JSON.parse(hit);

    if (!Array.isArray(stored)) {
      return null;
    }

    const candidates = stored.map(toFoodMatch);

    return candidates.every((candidate) => candidate !== null) ? (candidates as FoodMatch[]) : null;
  } catch {
    return null;
  }
}

/**
 * Only ever called for a lookup that actually ran AND came back. A lookup the rate budget
 * skipped, or one the provider could not answer, must never come through here: either
 * would be stored as a day-long "no match" for a food nobody ever got an answer about.
 */
export async function setCachedFood(
  provider: FoodProvider,
  query: string,
  candidates: FoodMatch[],
  scope = '',
): Promise<void> {
  if (candidates.length === 0) {
    // Short TTL: "no match" is the answer likeliest to change as a database grows.
    await cacheSet(foodKey(provider, query, scope), FOOD_MISS, FOOD_MISS_TTL_SECONDS);
    return;
  }

  await cacheSet(foodKey(provider, query, scope), JSON.stringify(candidates), FOOD_TTL_SECONDS);
}
