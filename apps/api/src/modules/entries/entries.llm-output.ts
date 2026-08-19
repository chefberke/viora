/** Guards over the model's JSON. The only place that reads the wire field names. */
import { isEntryKind } from '../../types/index.ts';
import { clamp } from '../../utils/index.ts';
import { pipelineError } from './entries.errors.ts';
import type { LlmItem, LlmParse, Nutrition100g } from './entries.types.ts';

/** Items past this are dropped: each one costs a USDA lookup, so a row cannot be unbounded. */
const MAX_ITEMS = 15;

function asConfidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}

function asNutrition(value: unknown): Nutrition100g {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  const read = (key: string, max: number): number => {
    const raw = record[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, 0, max) : 0;
  };

  return { kcal: read('kcal', 900), protein: read('protein', 100), carbs: read('carbs', 100), fat: read('fat', 100) };
}

function toItem(entry: unknown): LlmItem {
  if (typeof entry !== 'object' || entry === null) {
    throw pipelineError('llm_invalid_output');
  }

  const item = entry as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name.trim().toLowerCase() : '';

  if (name === '') {
    throw pipelineError('llm_invalid_output');
  }

  const quantity = item.quantity;
  const estimatedGrams = item.estimated_grams;

  return {
    name,
    quantity:
      typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0
        ? clamp(quantity, 0.01, 100)
        : 1,
    unit: typeof item.unit === 'string' && item.unit !== '' ? item.unit.toLowerCase() : 'serving',
    estimatedGrams:
      typeof estimatedGrams === 'number' && Number.isFinite(estimatedGrams) && estimatedGrams > 0
        ? clamp(estimatedGrams, 1, 5000)
        : null,
    per100g: asNutrition(item.estimated_per_100g),
    kind: isEntryKind(item.kind) ? item.kind : 'food',
    confidence: asConfidence(item.confidence),
  };
}

/**
 * Anything structurally wrong is a hard `llm_invalid_output`; merely out-of-range
 * numbers are clamped instead, because a usable parse with a tamed value beats a
 * failed row.
 */
export function validateLlmOutput(raw: string): LlmParse {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: unknown;

  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw pipelineError('llm_invalid_output');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw pipelineError('llm_invalid_output');
  }

  const record = parsed as Record<string, unknown>;

  if (!Array.isArray(record.items)) {
    throw pipelineError('llm_invalid_output');
  }

  return {
    normalizedText: typeof record.normalized_text === 'string' ? record.normalized_text.trim() : '',
    reasoning: typeof record.reasoning === 'string' ? record.reasoning.trim() : '',
    confidence: asConfidence(record.confidence),
    items: record.items.slice(0, MAX_ITEMS).map(toItem),
  };
}
