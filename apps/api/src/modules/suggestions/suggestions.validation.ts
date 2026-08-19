/** Request guards for the suggestions route. Nothing here touches the database. */
import { badRequest } from '../../utils/index.ts';
import { asDayNumber, asMinuteOfDay } from '../entries/entries.validation.ts';

export interface SuggestionsQuery {
  day: number;
  minute: number;
}

/**
 * The client's own day and minute. Both are required: the server is UTC and has no way to
 * work out either one for a user who is not, so a missing minute is a bad request rather
 * than something to guess at.
 */
export function parseSuggestionsQuery(query: Record<string, unknown>): SuggestionsQuery {
  const day = asDayNumber(query.day);
  const minute = asMinuteOfDay(query.minute);

  if (day === null || minute === null) {
    throw badRequest('invalid_query');
  }

  return { day, minute };
}
