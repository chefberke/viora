/**
 * Every version marker the entries module keys a cache on. They live together so a
 * bump is one edit in one file.
 */
import { sha256 } from '../../utils/index.ts';
import { FEW_SHOTS, SYSTEM_PROMPT, wrapDiaryLine } from './entries.prompt.ts';
import type { FoodProvider } from './entries.types.ts';

/** Bump on a prompt or output-shape change. Recorded on every `parse_traces` row. */
export const PROMPT_VERSION = 'v3';

/**
 * One version per food provider, because they fail apart: a change to how Open Food Facts
 * candidates are picked must not throw away a warm USDA cache. Bump when the stored shape
 * or that provider's ranking rules change — v3 stores the ranked candidate list rather
 * than the single row an older ranking chose.
 */
export const FOOD_KEY_VERSION: Record<FoodProvider, string> = { usda: 'v3', off: 'v3' };

/**
 * The shape the parse cache stores. It holds the model's answer verbatim now, rather than
 * the object an older `validateLlmOutput` turned that answer into, so that the validator
 * is the only thing that has ever produced an `LlmParse`. A stored object written by the
 * previous format shares enough field names with the wire format to validate as a badly
 * degraded parse instead of failing, so the two must never meet: this marker is what
 * keeps them apart.
 */
export const PARSE_CACHE_VERSION = 'v2';

/**
 * The prompt text itself, hashed. It sits in the parse cache key beside
 * `PROMPT_VERSION`, so editing the prompt and forgetting the bump still cannot serve
 * a parse the old text produced.
 *
 * The wrapper the user's line arrives in is hashed with it. It is as much a part of what
 * the model was asked as the system text is, and a change to it changes the answers —
 * leaving it out would let the delimiters move while every cached parse stayed valid.
 */
export const PROMPT_FINGERPRINT = sha256(
  SYSTEM_PROMPT + JSON.stringify(FEW_SHOTS) + wrapDiaryLine(''),
).slice(0, 8);
