/**
 * Every version marker the entries module keys a cache on. They live together so a
 * bump is one edit in one file.
 */
import { sha256 } from '../../utils/index.ts';
import { FEW_SHOTS, SYSTEM_PROMPT } from './entries.prompt.ts';

/** Bump on a prompt or output-shape change. Recorded on every `parse_traces` row. */
export const PROMPT_VERSION = 'v2';

/** Bump when the `UsdaMatch` shape or the match-picking rules change. */
export const USDA_KEY_VERSION = 'v1';

/**
 * The prompt text itself, hashed. It sits in the parse cache key beside
 * `PROMPT_VERSION`, so editing the prompt and forgetting the bump still cannot serve
 * a parse the old text produced.
 */
export const PROMPT_FINGERPRINT = sha256(SYSTEM_PROMPT + JSON.stringify(FEW_SHOTS)).slice(0, 8);
