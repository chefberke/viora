/**
 * How a database row is judged against the food a user named.
 *
 * Both providers rank their own rows, but they were making the same three mistakes, so
 * the vocabulary that fixes them lives here rather than twice.
 *
 * The mistakes, measured on the gold set:
 *
 *  1. **Plurals were different words.** `foldTokens` splits on letters only, so "apple"
 *     did not match "Apples, raw" at all — the one right row in the list scored zero and
 *     was rejected below `MIN_OVERLAP`, leaving the field to a pastry.
 *  2. **A row was scored only on what the QUERY asked for.** A one-word query is fully
 *     satisfied by any row containing that word, so "apple" scored a perfect 1.0 against
 *     "Croissants, apple" and fed that 1.0 straight into the item's confidence. What a
 *     row adds is as much a part of its identity as what it shares.
 *  3. **Every added word was worth the same.** It is not: "Bananas, raw" and
 *     "Melon, banana (Navajo)" each add one word to the query "banana", and only one of
 *     them is still a banana.
 *
 * The third is what the position rules below are for. USDA writes a description as
 * `Primary, qualifier, qualifier` — the first comma segment names the food and everything
 * after it narrows that food down. So an unmatched word before the first comma changes
 * WHAT the row is, and an unmatched word after it only says WHICH ONE. They cannot cost
 * the same. Open Food Facts has no such convention, so it treats the whole product title
 * as the primary segment and gets the same penalty structure with nothing to skip.
 */
import { foldTokens } from './entries.text.ts';

/**
 * Plural to singular, to the depth food English actually needs. It is deliberately not a
 * stemmer: stemming would fold "oats" onto "oat" and also "olives" onto "oliv", and the
 * second kind of collision costs more than the first kind gains.
 */
export function singular(token: string): string {
  if (token.length <= 3 || !token.endsWith('s') || token.endsWith('ss') || token.endsWith('us')) {
    return token;
  }

  if (token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }

  // The foods that pluralise this way all end in a consonant plus -oes: potato, tomato,
  // mango. Without this, "potatoes" folded to "potatoe" and stopped matching "potato" —
  // which is how "150 gram kızarmış patates" scored as a food we never found.
  if (/[^aeiou]oes$/.test(token)) {
    return token.slice(0, -2);
  }

  if (/(ch|sh|s|x|z)es$/.test(token)) {
    return token.slice(0, -2);
  }

  return token.slice(0, -1);
}

/** Comparable words: folded the way the rest of the pipeline folds, then singularised. */
export function contentTokens(text: string): string[] {
  return foldTokens(text).map(singular);
}

/**
 * Words that carry no food identity. Present in a row they cost nothing, and present in
 * a query they are not something a row has to answer for.
 *
 * `grade`, `large` and `medium` are here because USDA stamps them on rows that are
 * otherwise the plain food ("Eggs, Grade A, Large, egg whole"), not because size never
 * matters — a line that says "large" says it in the portion, never in the food name.
 */
const FILLER = new Set([
  'and',
  'or',
  'with',
  'without',
  'in',
  'of',
  'from',
  'the',
  'all',
  'commercial',
  'variety',
  'type',
  'style',
  'kind',
  'includes',
  'including',
  'added',
  'other',
  'assorted',
  'grade',
  'large',
  'medium',
  'small',
  'usda',
  'nfs',
  'ns',
]);

/**
 * Words that say the row is the ordinary, unelaborated form of its food. A query that
 * named no variety is asking for exactly this, so they are never charged as additions.
 */
const GENERIC_MARKERS = new Set(['whole', 'plain', 'regular', 'natural', 'ordinary']);

/**
 * Words that name a PART or a DERIVATIVE rather than a preparation. A row carrying one of
 * these that the query did not ask for is a different food, not a narrower one: egg white
 * is not egg, avocado oil is not avocado, and sweet potato leaves are not sweet potato.
 * They are charged well above an ordinary qualifier for that reason.
 */
const PART_MARKERS = new Set([
  'white',
  'yolk',
  'leaf',
  'leave',
  'stem',
  'skin',
  'peel',
  'seed',
  'flour',
  'oil',
  'powder',
  'juice',
  'butter',
  'paste',
  'sauce',
  'syrup',
  'extract',
  'chip',
  'crisp',
  'cracker',
  'cake',
  'cookie',
  'bar',
  'candy',
  'crouton',
  'substitute',
  'flavour',
  'flavor',
  'flavoured',
  'flavored',
]);

/**
 * What state a food is in. Preparation and processing are kept apart on purpose: they are
 * used by two different rules below, because a diary line is silent about the first in a
 * way it is never silent about the second.
 */
export type FoodState = 'cooked' | 'fried' | 'raw' | 'processed';

const STATE_WORDS: Record<string, FoodState> = {
  cooked: 'cooked',
  boiled: 'cooked',
  baked: 'cooked',
  roasted: 'cooked',
  roast: 'cooked',
  grilled: 'cooked',
  broiled: 'cooked',
  steamed: 'cooked',
  braised: 'cooked',
  stewed: 'cooked',
  poached: 'cooked',
  brewed: 'cooked',
  prepared: 'cooked',
  fried: 'fried',
  sauteed: 'fried',
  crisped: 'fried',
  raw: 'raw',
  uncooked: 'raw',
  fresh: 'raw',
  dry: 'processed',
  dried: 'processed',
  dehydrated: 'processed',
  powdered: 'processed',
  canned: 'processed',
  frozen: 'processed',
  condensed: 'processed',
  concentrate: 'processed',
  concentrated: 'processed',
  instant: 'processed',
  mix: 'processed',
  unprepared: 'processed',
  sulfured: 'processed',
  freeze: 'processed',
};

function isStateWord(token: string): boolean {
  return Object.hasOwn(STATE_WORDS, token);
}

export function statesOf(tokens: readonly string[]): Set<FoodState> {
  const states = new Set<FoodState>();

  for (const token of tokens) {
    if (isStateWord(token)) {
      states.add(STATE_WORDS[token]!);
    }
  }

  return states;
}

/** A row that agrees with the state the line named is worth this much extra. */
const STATE_AGREEMENT = 0.35;

/** A row that names a different state than the line did. "Boiled" is not "fried". */
const STATE_CONTRADICTION = 0.5;

/**
 * A row that is dried, canned, frozen or a powder when the line said nothing about it.
 *
 * This is the one state rule that fires on silence, and only in this direction. "Cooked"
 * and "raw" are both ordinary ways to eat a food and a line that names neither has not
 * told us which — guessing there would trade one wrong answer for another. But a line
 * that names neither has told us something about milk powder and dried apple: nobody logs
 * those without saying so.
 */
const PROCESSED_UNASKED = 0.55;

/**
 * How the states the row names change its rank against the states the line named.
 */
export function stateAdjustment(query: Set<FoodState>, row: Set<FoodState>): number {
  let adjustment = 0;

  for (const state of query) {
    if (row.has(state)) {
      adjustment += STATE_AGREEMENT;
    }
  }

  // Only preparation contradicts. A row can be both frozen and fried without lying.
  const queryPrep = [...query].filter((state) => state !== 'processed');
  const rowPrep = [...row].filter((state) => state !== 'processed');

  if (queryPrep.length > 0 && rowPrep.length > 0 && !rowPrep.some((state) => query.has(state))) {
    adjustment -= STATE_CONTRADICTION;
  }

  if (!query.has('processed') && row.has('processed')) {
    adjustment -= PROCESSED_UNASKED;
  }

  return adjustment;
}

/**
 * How far a row's own energy figure may sit from the model's estimate for the item before
 * the gap is evidence rather than noise.
 *
 * Inside the band the estimate says nothing and the words decide. Measured on the gold
 * set, the pass rate is flat from 1.0 to 1.3 and falls away on either side of that
 * plateau — 81.0% here, 76.2% at 1.4, 71.4% at 3.0 — so the value is taken from the wide
 * end of a broad region rather than from a peak. It is tuned on the gold set and that is
 * the honest caveat on it: a tighter band than this reads a normal difference between a
 * lean and a fatty cut as evidence, and a looser one stops separating yogurt from
 * yogurt-flavoured biscuit.
 */
export const PLAUSIBLE_FACTOR = 1.25;

/**
 * How far the row's energy sits outside that band, in natural log units. Zero whenever
 * the two agree closely enough to say nothing, and zero when there is nothing to compare:
 * a missing estimate must never be read as a disagreement.
 *
 * Two things read this. The ranking uses it to choose between rows the words cannot
 * separate — USDA answers "greek yogurt" with ten rows carrying that exact description
 * and energies from 65 to 467. The item's confidence uses it to say how sure that choice
 * was, which is the honest use: a row picked over a wide disagreement is a row we are
 * less certain about, and until now nothing in the confidence score knew that.
 */
export function energyDisagreement(rowKcal: number, estimateKcal: number): number {
  if (estimateKcal <= 0 || rowKcal <= 0) {
    return 0;
  }

  return Math.max(0, Math.abs(Math.log(rowKcal / estimateKcal)) - Math.log(PLAUSIBLE_FACTOR));
}

/** An unmatched word in the primary segment: the row is a different food. */
const PRIMARY_PENALTY = 0.8;

/** An unmatched word after the first comma: the row is a narrower version of the food. */
const QUALIFIER_PENALTY = 0.14;

/** A narrowing that goes far enough to change the food. See `PART_MARKERS`. */
const PART_PENALTY = 0.45;

/**
 * The most an accumulation of ordinary qualifiers can cost. USDA's canonical rows are
 * long by convention ("Avocados, raw, all commercial varieties"), and without a ceiling
 * the plainest description of a food would be beaten by any terser wrong one — which is
 * exactly the trap the old flat per-token penalty fell into.
 */
const QUALIFIER_PENALTY_CAP = 0.45;

export interface RowScore {
  /** 0-1 share of the query's words the row carries. Feeds the item's confidence. */
  coverage: number;
  /** What the row's own words cost it, before any provider weight. Never positive. */
  penalty: number;
  /** State agreement and contradiction, signed. */
  stateBonus: number;
}

/**
 * Scores one row's words against one query's words.
 *
 * `primary` is the part of the row that names the food; `qualifiers` is everything that
 * narrows it. A provider with no such convention passes its whole name as `primary` and
 * an empty `qualifiers`.
 */
export function scoreRow(
  queryTokens: readonly string[],
  primary: readonly string[],
  qualifiers: readonly string[],
): RowScore {
  const asked = new Set(queryTokens);
  const carried = new Set([...primary, ...qualifiers]);

  const answerable = queryTokens.filter((token) => !FILLER.has(token));
  const matched = answerable.filter((token) => carried.has(token)).length;
  const coverage = answerable.length === 0 ? 0 : matched / answerable.length;

  const chargeable = (token: string): boolean =>
    !asked.has(token) && !FILLER.has(token) && !GENERIC_MARKERS.has(token) && !isStateWord(token);

  const primaryExtra = primary.filter(chargeable).length;

  let qualifierCost = 0;
  let partCost = 0;

  for (const token of qualifiers) {
    if (!chargeable(token)) {
      continue;
    }

    if (PART_MARKERS.has(token)) {
      partCost += PART_PENALTY;
    } else {
      qualifierCost += QUALIFIER_PENALTY;
    }
  }

  const penalty =
    -PRIMARY_PENALTY * primaryExtra - Math.min(qualifierCost, QUALIFIER_PENALTY_CAP) - partCost;

  return {
    coverage,
    penalty,
    stateBonus: stateAdjustment(statesOf(queryTokens), statesOf([...primary, ...qualifiers])),
  };
}

/**
 * USDA class prefixes: a first segment that names a shelf rather than a food. They are
 * stepped over so the segment after them is read as the primary one.
 *
 * Without this, "Beverages, coffee, brewed" would be charged for not being a beverage,
 * and would lose to a frozen dessert called "COFFEE". With it, `Snacks, banana chips` is
 * still charged — its primary becomes "banana chips", and "chips" is what makes it not a
 * banana. That asymmetry is the whole point: skipping the shelf label exposes the food.
 */
const CLASS_PREFIXES = new Set([
  'beverage',
  'alcoholic beverage',
  'babyfood',
  'baby food',
  'snack',
  'fast food',
  'restaurant food',
  'meal entree and side dish',
  'usda commodity',
  'school lunch',
  'formulated bar',
]);

/**
 * Splits a USDA description into the segment that names the food and the ones that
 * narrow it.
 */
export function splitDescription(description: string): {
  primary: string[];
  qualifiers: string[];
} {
  const segments = description
    .split(',')
    .map((segment) => contentTokens(segment))
    .filter((tokens) => tokens.length > 0);

  if (segments.length === 0) {
    return { primary: [], qualifiers: [] };
  }

  let index = 0;

  // A description that is nothing but shelf labels keeps its first one as the food.
  while (index < segments.length - 1 && CLASS_PREFIXES.has(segments[index]!.join(' '))) {
    index += 1;
  }

  return {
    primary: segments[index]!,
    qualifiers: segments.filter((_, position) => position !== index).flat(),
  };
}
