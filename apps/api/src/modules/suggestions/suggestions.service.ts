/**
 * What the suggestions route does once the request is known to be well formed: fold the
 * history (or take the fold from cache), score every candidate against the client's own
 * clock, and hand back the best few.
 *
 * Nothing in this path reads a clock. The day and the minute both come from the device, since
 * the server runs in UTC and cannot know what time it is where the user is eating.
 */
import type { SuggestionDto } from '../../types/index.ts';
import { buildHistoryAggregate } from './suggestions.aggregate.ts';
import { MAX_CANDIDATES } from './suggestions.constants.ts';
import { scoreCandidate } from './suggestions.score.ts';
import type { CandidateStats } from './suggestions.types.ts';

function sourceOf(candidate: CandidateStats): SuggestionDto['source'] {
  if (!candidate.isBookmarked) {
    return 'history';
  }

  return candidate.hasHistory ? 'both' : 'bookmark';
}

export async function listSuggestions(
  userId: string,
  day: number,
  minute: number,
): Promise<SuggestionDto[]> {
  // Not cached, deliberately. The fold reads four small columns off an indexed range, so it
  // costs milliseconds — while a cache of it would have to be invalidated by every entry and
  // every bookmark, and a bookmark change cannot even name the day whose fold it spoiled.
  // The client already asks at most once a quarter hour. See the query in the aggregate.
  const aggregate = await buildHistoryAggregate(userId, day);

  const context = {
    day,
    minute,
    activeDays: aggregate.activeDays,
    partners: aggregate.partners,
  };

  const scored: SuggestionDto[] = [];

  for (const candidate of aggregate.candidates) {
    const score = scoreCandidate(candidate, context);

    if (score === null) {
      continue;
    }

    scored.push({ key: candidate.key, text: candidate.text, source: sourceOf(candidate), score });
  }

  // Ties broken by text so the order is stable across requests; a list that reshuffles under
  // the finger is worse than a list that is slightly wrong.
  scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

  return scored.slice(0, MAX_CANDIDATES);
}
