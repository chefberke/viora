/**
 * What a correction does to a stored parse.
 *
 * Every line of this file is arithmetic on data that is already on disk: no model call, no
 * database lookup, no clock. That is deliberate and it is the whole reason the correction
 * loop is cheap enough to exist. A person fixing a row is not asking to be re-parsed — they
 * have already told the parser what the answer is, and the only work left is to price it.
 *
 * The one thing that makes this possible is `ParsedItem.per100g` and `ParsedItem.candidates`.
 * The item carries the row it was priced from and the rows that lost, so "no, the other
 * yogurt" and "make it 300 g" are both answerable from the item itself.
 *
 * It is pure so that `scripts/entries.check.ts` can hold the whole correction path to
 * account without a database — the same trick `ParseDeps` plays for the pipeline.
 */
import type {
  CorrectionType,
  EntryKind,
  ItemCandidate,
  ParsedItem,
  ParseResult,
} from '../../types/index.ts';
import { badRequest } from '../../utils/index.ts';
import { buildSources, describeMatch, rowKind, sumTotals } from './entries.assemble.ts';
import { confidenceLevel, overallConfidence } from './entries.confidence.ts';
import { scaleNutrition, toGrams, toMl } from './entries.portion.ts';

/**
 * A person set this by hand, so there is nothing left to be uncertain about. It is the one
 * place a confidence of exactly 1 is honest, and it is what makes a corrected item legible
 * in the calibration curve later: everything at 1.0 was a human.
 */
const CORRECTED_CONFIDENCE = 1;

/**
 * One edit to one item. The union is the same vocabulary the ledger stores, because a
 * correction that cannot be written down is a correction that taught nothing.
 */
export type CorrectionOp =
  | { type: 'pick_candidate'; itemIndex: number; candidateIndex: number }
  | { type: 'set_food'; itemIndex: number; food: ItemCandidate }
  | { type: 'set_portion'; itemIndex: number; quantity: number; unit: string; grams: number | null }
  | { type: 'remove_item'; itemIndex: number }
  | {
      type: 'add_item';
      name: string;
      quantity: number;
      unit: string;
      kind: EntryKind;
      grams: number | null;
      food: ItemCandidate | null;
    };

/** One ledger row: the item on both sides of the edit. */
export interface AppliedCorrection {
  type: CorrectionType;
  /** Index into the items of the revision this was applied to. -1 for `add_item`. */
  itemIndex: number;
  before: ParsedItem | null;
  after: ParsedItem | null;
}

/**
 * How many grams the new portion is.
 *
 * An explicit figure wins outright — a client that knows the weight should be able to say
 * so, and `toGrams` still bounds and rounds it. Otherwise the unit decides, and the only
 * interesting case is a unit that fixes no size of its own ("2 slices", "a plate"): there,
 * the item's own history is the best estimate there is. Three slices of the bread that
 * weighed 40 g a slice is 120 g, and no database has to be asked to know that. A unit the
 * item has never been measured in tells us nothing, so it falls back to the stand-in.
 */
function gramsFor(item: ParsedItem, quantity: number, unit: string, grams: number | null): number {
  if (grams !== null) {
    return toGrams(grams, 'g', null);
  }

  const measured = item.kind === 'water' ? item.ml : item.grams;
  const perUnit =
    unit === item.unit && measured !== null && item.quantity > 0 ? measured / item.quantity : null;
  const estimate = perUnit === null ? null : perUnit * quantity;

  return item.kind === 'water' ? toMl(quantity, unit, estimate) : toGrams(quantity, unit, estimate);
}

/** The numbers for an item priced from `per100g` at `grams`. Water has none. */
function priced(
  item: ParsedItem,
  grams: number,
): Pick<ParsedItem, 'grams' | 'ml' | 'calories' | 'protein' | 'carbs' | 'fat'> {
  if (item.kind === 'water') {
    return { grams: null, ml: grams, calories: 0, protein: 0, carbs: 0, fat: 0 };
  }

  const per100g = item.per100g;

  return {
    grams,
    ml: null,
    ...(per100g === null
      ? { calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat }
      : scaleNutrition(per100g, grams)),
  };
}

/**
 * The marks a person's hand leaves on an item: certain, corrected, and no longer asking.
 * Whatever the parser thought of this row, a human has now looked at it.
 */
function signed(item: ParsedItem): ParsedItem {
  return {
    ...item,
    confidence: CORRECTED_CONFIDENCE,
    needsReview: false,
    corrected: true,
  };
}

/**
 * The row a person is moving away from, put back on the list they are choosing from.
 *
 * A pick has to be reversible: someone who tries the second yogurt and finds it worse must
 * be able to go back to the first without a search. `detail` is empty because the item never
 * stored it apart — `matchedDescription` is already the two of them joined, and joining it
 * again would double the brand.
 */
function displaced(item: ParsedItem): ItemCandidate[] {
  if (item.per100g === null || item.sourceId === null || item.source === 'llm_estimate') {
    return [];
  }

  return [
    {
      provider: item.source === 'off' ? 'off' : 'usda',
      id: item.sourceId,
      description: item.matchedDescription ?? item.name,
      detail: '',
      per100g: item.per100g,
    },
  ];
}

/**
 * How long the choice list may grow. Three alternates plus the row a person just moved away
 * from; past that, repeated picks would accumulate every row ever shown on an entry that is
 * stored forever.
 */
const MAX_CANDIDATES = 4;

/** The item re-pointed at a different database row and re-priced from it. */
function withFood(
  item: ParsedItem,
  food: ItemCandidate,
  rest: readonly ItemCandidate[],
): ParsedItem {
  const grams = (item.kind === 'water' ? item.ml : item.grams) ?? 0;
  const moved: ParsedItem = {
    ...item,
    source: food.provider,
    sourceId: food.id,
    matchedDescription: describeMatch(food),
    per100g: food.per100g,
    candidates: [...displaced(item), ...rest].slice(0, MAX_CANDIDATES),
  };

  return signed({ ...moved, ...priced(moved, grams) });
}

function applyOne(item: ParsedItem, op: CorrectionOp): ParsedItem {
  switch (op.type) {
    case 'pick_candidate': {
      const food = item.candidates[op.candidateIndex];

      if (food === undefined) {
        throw badRequest('invalid_candidate_index');
      }

      return withFood(
        item,
        food,
        item.candidates.filter((_, index) => index !== op.candidateIndex),
      );
    }

    case 'set_food':
      return withFood(item, op.food, item.candidates);

    case 'set_portion': {
      const grams = gramsFor(item, op.quantity, op.unit, op.grams);
      const moved: ParsedItem = { ...item, quantity: op.quantity, unit: op.unit };

      return signed({ ...moved, ...priced(moved, grams) });
    }

    // Handled by the caller: they change the shape of the list, not one item in it.
    case 'remove_item':
    case 'add_item':
      return item;
  }
}

/** An item a person added to a row the parser had already read. */
function newItem(op: Extract<CorrectionOp, { type: 'add_item' }>): ParsedItem {
  const base: ParsedItem = {
    name: op.name,
    quantity: op.quantity,
    unit: op.unit,
    grams: null,
    ml: null,
    kind: op.kind,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    source: op.kind === 'water' ? 'water' : op.food === null ? 'llm_estimate' : op.food.provider,
    sourceId: op.food?.id ?? null,
    matchedDescription: op.food === null ? null : describeMatch(op.food),
    confidence: CORRECTED_CONFIDENCE,
    per100g: op.food?.per100g ?? null,
    candidates: [],
    needsReview: false,
    corrected: true,
  };

  const grams = gramsFor(base, op.quantity, op.unit, op.grams);

  return { ...base, ...priced(base, grams) };
}

function indexOf(op: CorrectionOp): number {
  return op.type === 'add_item' ? -1 : op.itemIndex;
}

/**
 * Applies a batch of edits to a stored parse and returns the new parse plus the ledger rows
 * that describe it.
 *
 * Every index in the batch is resolved against the array the client was looking at, never
 * against the array as it mutates. Removing item 0 and re-portioning item 1 in one request
 * is an ordinary thing to ask for, and under naive sequential application the second edit
 * would land on the wrong food and say nothing about it. So removals are tombstoned and the
 * list is compacted once, at the end.
 *
 * Nothing here patches a total. The row's numbers, sources, kind and confidence are all
 * rebuilt from the items by the same functions the pipeline uses, because a total that was
 * summed one way and adjusted another drifts from the list it claims to be the sum of.
 */
export function applyCorrections(
  result: ParseResult,
  ops: readonly CorrectionOp[],
): { result: ParseResult; applied: AppliedCorrection[] } {
  if (ops.length === 0) {
    throw badRequest('no_ops');
  }

  const working: (ParsedItem | null)[] = [...result.items];
  const added: ParsedItem[] = [];
  const applied: AppliedCorrection[] = [];

  for (const op of ops) {
    if (op.type === 'add_item') {
      const after = newItem(op);

      added.push(after);
      applied.push({ type: 'add_item', itemIndex: -1, before: null, after });
      continue;
    }

    if (op.itemIndex < 0 || op.itemIndex >= result.items.length) {
      throw badRequest('invalid_item_index');
    }

    const before = working[op.itemIndex];

    // Already removed earlier in the same batch. Editing a row a person has just deleted is
    // a contradiction, not a merge conflict, so it is rejected rather than guessed at.
    if (before === null || before === undefined) {
      throw badRequest('item_already_removed');
    }

    if (op.type === 'remove_item') {
      working[op.itemIndex] = null;
      applied.push({ type: 'remove_item', itemIndex: op.itemIndex, before, after: null });
      continue;
    }

    const after = applyOne(before, op);

    working[op.itemIndex] = after;
    applied.push({ type: op.type, itemIndex: op.itemIndex, before, after });
  }

  const items = [...working.filter((item): item is ParsedItem => item !== null), ...added];
  const kind = rowKind(items);
  const confidence = items.length === 0 ? result.confidence : overallConfidence(items);

  return {
    result: {
      ...result,
      kind,
      confidence,
      confidenceLevel: confidenceLevel(confidence),
      items,
      totals: sumTotals(items),
      sources: buildSources(items),
    },
    applied,
  };
}
