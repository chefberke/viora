/** Request guards for the saved-meals routes. Nothing here touches the database. */
import type { SaveMealRequest } from '../../types/index.ts';
import { badRequest } from '../../utils/index.ts';

const MAX_TEXT_LENGTH = 500;

/**
 * A saved meal's body. `result` is passed through unchecked on purpose: it is either a parse
 * this same server produced a moment ago, or it is absent and the server parses the text
 * itself. There is no third case worth validating a whole `ParseResult` shape for.
 */
export function parseSaveMealBody(body: unknown): SaveMealRequest {
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const text = typeof input.text === 'string' ? input.text.trim() : '';

  if (text === '' || text.length > MAX_TEXT_LENGTH) {
    throw badRequest('invalid_body');
  }

  return {
    text,
    result: (input.result ?? null) as SaveMealRequest['result'],
    sourceEntryId: typeof input.sourceEntryId === 'string' ? input.sourceEntryId : null,
  };
}
