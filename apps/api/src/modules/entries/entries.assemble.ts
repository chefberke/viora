/**
 * The pieces that turn a list of priced items into a stored parse: the row's kind, its
 * totals, its reference list, and the two small conversions a matched database row goes
 * through on its way to the client.
 *
 * They live apart from the pipeline because the correction endpoint has to produce exactly
 * the same shapes from a different starting point. A parse whose totals were summed one way
 * and re-summed another after an edit would drift from its own items, and nothing would say
 * so — the sheet would simply show a number that is not the sum of what is above it.
 */
import { env } from '../../config/index.ts';
import type {
  EntryKind,
  ItemCandidate,
  NutrientTotals,
  ParsedItem,
  ParseSource,
} from '../../types/index.ts';
import { round1 } from '../../utils/index.ts';
import type { FoodMatch } from './entries.types.ts';

/** A matched row, reduced to what a person choosing between rows actually needs. */
export function toCandidate(match: FoodMatch): ItemCandidate {
  return {
    provider: match.provider,
    id: match.id,
    description: match.description,
    detail: match.detail,
    per100g: match.per100g,
  };
}

/**
 * The reference title an item shows. The brand is what makes a barcode row recognisable,
 * so it travels with the name; a USDA data type ("Foundation") tells a reader nothing and
 * stays out.
 */
export function describeMatch(candidate: ItemCandidate): string {
  return candidate.detail !== '' && candidate.provider === 'off'
    ? `${candidate.description} — ${candidate.detail}`
    : candidate.description;
}

export function rowKind(items: readonly ParsedItem[]): EntryKind {
  // A row is water only when every item is: a meal with a glass of water is food.
  return items.length > 0 && items.every((item) => item.kind === 'water') ? 'water' : 'food';
}

export function sumTotals(items: readonly ParsedItem[]): NutrientTotals {
  return {
    calories: items.reduce((sum, item) => sum + item.calories, 0),
    protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
    carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
    fat: round1(items.reduce((sum, item) => sum + item.fat, 0)),
    waterMl: items.reduce((sum, item) => sum + (item.ml ?? 0), 0),
  };
}

export function buildSources(items: readonly ParsedItem[]): ParseSource[] {
  const sources: ParseSource[] = [];
  const seen = new Set<string>();
  let hasEstimate = false;

  for (const item of items) {
    // Keyed by provider as well as id: a barcode and an fdcId share no id space.
    if ((item.source === 'usda' || item.source === 'off') && item.sourceId !== null) {
      const key = `${item.source}:${item.sourceId}`;

      if (!seen.has(key)) {
        seen.add(key);
        sources.push({
          kind: item.source,
          title: item.matchedDescription ?? item.name,
          sourceId: item.sourceId,
        });
      }
    }

    hasEstimate ||= item.source === 'llm_estimate';
  }

  if (hasEstimate) {
    sources.push({
      kind: 'llm',
      title: `Model estimate (${env.LLM_MODEL})`,
      sourceId: null,
    });
  }

  return sources;
}
