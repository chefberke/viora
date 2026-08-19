import { env } from '../../config/index.ts';
import { cacheGet, cacheSet } from '../../lib/redis.ts';
import { sha256 } from '../../utils/index.ts';
import type { LlmParse, UsdaMatch } from './entries.types.ts';
import { PROMPT_FINGERPRINT, PROMPT_VERSION, USDA_KEY_VERSION } from './entries.versions.ts';

const PARSE_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const USDA_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const USDA_MISS_TTL_SECONDS = 24 * 3600; // 1 day

/** Stored under a USDA key that searched and found nothing, so misses are cached too. */
const USDA_MISS = 'miss';

/**
 * Lowercase, unicode-normalize, and collapse whitespace — nothing else. Digits, units
 * and punctuation all change the meaning of a food line ("2 eggs" is not "eggs"),
 * so they stay in the key.
 */
export function normalizeInput(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Prompt and model are part of the key: neither changing must serve a stale parse. */
function parseKey(rawText: string): string {
  const prompt = `${PROMPT_VERSION}.${PROMPT_FINGERPRINT}`;

  return `viora:parse:${prompt}:${env.LLM_MODEL}:${sha256(normalizeInput(rawText))}`;
}

function usdaKey(name: string): string {
  return `viora:usda:${USDA_KEY_VERSION}:${sha256(normalizeInput(name))}`;
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

/** `null` = not cached; `'miss'` = cached "USDA has no match"; else the match. */
export async function getCachedUsda(name: string): Promise<UsdaMatch | 'miss' | null> {
  const hit = await cacheGet(usdaKey(name));

  if (hit === null) {
    return null;
  }

  if (hit === USDA_MISS) {
    return USDA_MISS;
  }

  try {
    return JSON.parse(hit) as UsdaMatch;
  } catch {
    return null;
  }
}

export async function setCachedUsda(name: string, match: UsdaMatch | null): Promise<void> {
  if (match === null) {
    // Short TTL: "no match" may just mean USDA was briefly down.
    await cacheSet(usdaKey(name), USDA_MISS, USDA_MISS_TTL_SECONDS);
    return;
  }

  await cacheSet(usdaKey(name), JSON.stringify(match), USDA_TTL_SECONDS);
}
