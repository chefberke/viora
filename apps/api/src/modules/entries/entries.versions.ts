/**
 * Every version marker the entries module keys a cache on. They live together so a
 * bump is one edit in one file.
 */
import { sha256 } from '../../utils/index.ts';
import { FEW_SHOTS, SYSTEM_PROMPT } from './entries.prompt.ts';
import type { FoodProvider } from './entries.types.ts';

/** Bump on a prompt or output-shape change. Recorded on every `parse_traces` row. */
export const PROMPT_VERSION = 'v1';

/**
 * One version per food provider, because they fail apart: a change to how Open Food Facts
 * candidates are picked must not throw away a warm USDA cache. Bump when the stored shape
 * or that provider's match-picking rules change.
 */
export const FOOD_KEY_VERSION: Record<FoodProvider, string> = { usda: 'v1', off: 'v1' };

/**
 * The prompt text itself, hashed. It sits in the parse cache key beside
 * `PROMPT_VERSION`, so editing the prompt and forgetting the bump still cannot serve
 * a parse the old text produced.
 */
export const PROMPT_FINGERPRINT = sha256(SYSTEM_PROMPT + JSON.stringify(FEW_SHOTS)).slice(0, 8);
