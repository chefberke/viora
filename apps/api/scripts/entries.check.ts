/**
 * A hand-run check of the parse pipeline. Not a test suite — the repo has no runner — but
 * the thing `ParseDeps` was always for: the whole pipeline, off the network, with each
 * provider stubbed to the case being checked.
 *
 *   npm run check
 *   npm run check -- --live "beyaz peynir" ayran
 *   npm run check -- --parse "bir ayran"
 *
 * `--live` calls Open Food Facts for real, and `--parse` calls the model and both
 * databases. Keep `--live` to eight names at a time and no more than once a minute, or it
 * trips the rate limit the pipeline is built around.
 */
import { applyCorrections, type CorrectionOp } from '../src/modules/entries/entries.corrections.ts';
import { validateLlmOutput } from '../src/modules/entries/entries.llm-output.ts';
import { pickBestMatch, searchOffFood, takeLocalOffSlot } from '../src/modules/entries/entries.off.ts';
import { parseRow } from '../src/modules/entries/entries.pipeline.ts';
import { rankMatches as rankUsdaMatches } from '../src/modules/entries/entries.usda.ts';
import type { ItemCandidate, ParsedItem, ParseResult } from '../src/types/index.ts';
import type {
  FoodMatch,
  FoodProvider,
  LlmCallResult,
  Nutrition100g,
  ParseOutcome,
  ProviderTrace,
  SearchFood,
} from '../src/modules/entries/entries.types.ts';

const PER_100G: Nutrition100g = { kcal: 250, protein: 17, carbs: 2, fat: 20 };

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  if (!ok) {
    failures += 1;
  }

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`}`);
}

/** `language` is the line's own, so a stub can put a row on either side of the skip rule. */
function llmStub(items: unknown[], language = 'tr'): () => Promise<LlmCallResult> {
  const raw = JSON.stringify({
    normalized_text: 'stub',
    reasoning: 'stub',
    confidence: 0.9,
    language,
    items,
  });

  return async () => ({ raw, promptTokens: null, completionTokens: null });
}

function food(name: string, localName: string, kind: 'food' | 'water' = 'food'): unknown {
  return {
    name,
    local_name: localName,
    quantity: 1,
    unit: 'serving',
    estimated_grams: 100,
    estimated_per_100g: { kcal: 200, protein: 10, carbs: 10, fat: 10 },
    kind,
    confidence: 0.9,
  };
}

function match(provider: 'usda' | 'off', rank: number, overlap = 1): FoodMatch {
  return {
    provider,
    id: provider === 'usda' ? '123456' : '8690504020677',
    description: provider === 'usda' ? 'cheese, white' : 'Beyaz Peynir',
    detail: provider === 'usda' ? 'SR Legacy' : 'Pınar',
    per100g: PER_100G,
    matchScore: overlap,
    rank,
  };
}

/** A provider that answers, and holds nothing. Not an outage — that would be `null`. */
const never: SearchFood = async () => [];

/** What one database did in that parse. Zeros when it never ran a wave at all. */
function ofProvider(outcome: ParseOutcome, provider: FoodProvider): ProviderTrace {
  return (
    outcome.trace.providers.find((entry) => entry.provider === provider) ?? {
      provider,
      lookups: 0,
      cacheHits: 0,
      skipped: 0,
      unreachable: 0,
      latencyMs: null,
    }
  );
}

async function offline(): Promise<void> {
  console.log('\n— pipeline, off the network —');

  const usdaOnly = await parseRow('x', {
    callLlm: llmStub([food('white rice', 'white rice')], 'en'),
    searchUsda: async () => [match('usda', 2)],
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('USDA answers alone', usdaOnly.result.items[0]?.source, 'usda');
  check('  and carries its id as a string', usdaOnly.result.items[0]?.sourceId, '123456');

  const offOnly = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: never,
    searchOff: async () => [match('off', 1.5)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('Open Food Facts answers where USDA cannot', offOnly.result.items[0]?.source, 'off');
  check('  the barcode is the id', offOnly.result.items[0]?.sourceId, '8690504020677');
  check('  the brand travels with the name', offOnly.result.items[0]?.matchedDescription, 'Beyaz Peynir — Pınar');
  check('  and the reference names the right database', offOnly.result.sources[0]?.kind, 'off');

  // Null, not []: the provider was asked and could not answer. The parse still succeeds
  // on an estimate, which is the whole danger — a revoked key looks exactly like a food
  // no database happens to hold, and only the trace tells them apart.
  const unreachable = await parseRow('x', {
    callLlm: llmStub([food('white rice', 'white rice')], 'en'),
    searchUsda: async () => null,
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('an outage still answers, on an estimate', unreachable.result.items[0]?.source, 'llm_estimate');
  check('  but the trace records the provider could not be reached', ofProvider(unreachable, 'usda').unreachable, 1);

  const neither = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: never,
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('with no database the row is a flagged estimate', neither.result.items[0]?.source, 'llm_estimate');
  check('  and a database that merely holds nothing is not an outage', ofProvider(neither, 'usda').unreachable, 0);
  check('  capped at 0.45', neither.result.items[0]?.confidence, 0.45);
  check('  and it asks to be reviewed, having nothing behind it', neither.result.items[0]?.needsReview, true);
  check('  with nothing to offer instead', neither.result.items[0]?.candidates, []);

  // The losing rows are what a correction picks from, so a parse that drops them makes the
  // whole loop impossible. Two rows in, one priced, one offered.
  const offered = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => [
      { provider: 'usda', id: 'won', description: 'Cheese, white', detail: 'Foundation', per100g: PER_100G, matchScore: 1, rank: 1.6 },
      { provider: 'usda', id: 'lost', description: 'Cheese, feta', detail: 'Foundation', per100g: { kcal: 264, protein: 14, carbs: 4, fat: 21 }, matchScore: 0.9, rank: 1.4 },
    ],
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('the row that lost is kept on the item', offered.result.items[0]?.candidates.map((c) => c.id), ['lost']);
  check('  and the row that won is what the item was priced from', offered.result.items[0]?.per100g?.kcal, PER_100G.kcal);

  const water = await parseRow('x', {
    callLlm: llmStub([food('water', 'su', 'water')]),
    searchUsda: never,
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('a water row stays water', water.result.kind, 'water');
  check(
    '  and asks no database anything',
    ofProvider(water, 'usda').lookups + ofProvider(water, 'off').lookups,
    0,
  );

  const mixed = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir'), food('bread', 'ekmek')]),
    searchUsda: async (name) => (name === 'bread' ? [match('usda', 2)] : []),
    searchOff: async () => [match('off', 1.5)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('a row from two databases traces as mixed', mixed.trace.source, 'mixed');

  console.log('\n— which database takes the item —');

  const margin = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => [match('usda', 1.4)],
    searchOff: async () => [match('off', 1.5)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('at equal fit, a lead inside the margin does not take the row', margin.result.items[0]?.source, 'usda');

  const clear = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => [match('usda', 1.0)],
    searchOff: async () => [match('off', 1.5)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('at equal fit, a lead past the margin does', clear.result.items[0]?.source, 'off');

  // The case the weights alone got wrong: a lab-measured row answering a translated
  // guess used to beat the user's own product however badly it fitted.
  const fit = await parseRow('x', {
    callLlm: llmStub([food('chocolate wafer', 'ülker çikolatalı gofret')]),
    searchUsda: async () => [match('usda', 2.0, 0.67)],
    searchOff: async () => [match('off', 1.5, 1)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('the closer fit takes the row even from the lighter database', fit.result.items[0]?.source, 'off');

  const fitBack = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => [match('usda', 1.0, 1)],
    searchOff: async () => [match('off', 1.5, 0.7)],
    takeOffSlot: () => true,
    useCache: false,
  });
  check('  and the rule runs both ways', fitBack.result.items[0]?.source, 'usda');

  console.log('\n— which items are worth a lookup —');

  let englishCalls = 0;
  const english = await parseRow('x', {
    callLlm: llmStub([food('white rice', 'white rice')], 'en'),
    searchUsda: async () => [match('usda', 2)],
    searchOff: async () => {
      englishCalls += 1;
      return [];
    },
    takeOffSlot: () => true,
    useCache: false,
  });
  check('an English line never reaches Open Food Facts', englishCalls, 0);
  check('  and is counted as skipped', ofProvider(english, 'off').skipped, 1);

  let brandCalls = 0;
  await parseRow('x', {
    callLlm: llmStub([food('coca-cola', 'coke')], 'en'),
    searchUsda: async () => [match('usda', 2)],
    searchOff: async () => {
      brandCalls += 1;
      return [];
    },
    takeOffSlot: () => true,
    useCache: false,
  });
  check('an English line still asks about a name it translated', brandCalls, 1);

  // The bug this rule was written for: "ayran" has no English name, so the model returns
  // the same word twice — which read as "this line is English" and skipped the one
  // database that has the product.
  let localCalls = 0;
  const localOnly = await parseRow('x', {
    callLlm: llmStub([food('ayran', 'ayran')]),
    searchUsda: async () => [match('usda', 0.6)],
    searchOff: async () => {
      localCalls += 1;
      return [match('off', 1.5)];
    },
    takeOffSlot: () => true,
    useCache: false,
  });
  check('a local food with no English name is asked about', localCalls, 1);
  check('  and nothing is counted as skipped', ofProvider(localOnly, 'off').skipped, 0);
  check('  and the local database takes the row', localOnly.result.items[0]?.source, 'off');

  let disabledCalls = 0;
  const disabled = await parseRow('x', {
    callLlm: llmStub([food('ayran', 'ayran')]),
    searchUsda: async () => [match('usda', 0.6)],
    searchOff: async () => {
      disabledCalls += 1;
      return [match('off', 1.5)];
    },
    takeOffSlot: () => true,
    offEnabled: false,
    useCache: false,
  });
  check('with the provider switched off nothing is asked', disabledCalls, 0);
  check(
    '  and it leaves no trace row at all',
    disabled.trace.providers.map((entry) => entry.provider),
    ['usda'],
  );

  console.log('\n— the per-row rate budget —');

  let calls = 0;
  const long = await parseRow('x', {
    callLlm: llmStub(
      Array.from({ length: 10 }, (_unused, index) => food(`food ${index}`, `yemek ${index}`)),
    ),
    searchUsda: never,
    searchOff: async () => {
      calls += 1;
      return [];
    },
    takeOffSlot: () => true,
    useCache: false,
  });
  check('one row cannot spend the whole minute', calls, 4);
  check('  the rest are skipped, not called', ofProvider(long, 'off').skipped, 6);
  check('  and a skipped lookup is not counted as one', ofProvider(long, 'off').lookups, 4);

  console.log('\n— what the trace records —');

  check('each database is traced on its own row', offOnly.trace.providers.length, 2);
  check('  and times its own wave', typeof ofProvider(offOnly, 'off').latencyMs, 'number');
  check(
    '  a water row times neither',
    [ofProvider(water, 'usda').latencyMs, ofProvider(water, 'off').latencyMs],
    [null, null],
  );
}

/** The matcher on its own, so the quality gates can be checked without the network. */
function matching(): void {
  console.log('\n— Open Food Facts, picking the product —');

  const hit = (name: string, brands: string, code: string, kcal = 100): unknown => ({
    code,
    product_name: name,
    brands,
    nutriments: {
      'energy-kcal_100g': kcal,
      proteins_100g: 5,
      fat_100g: 5,
      carbohydrates_100g: 10,
    },
  });

  const rivals = [hit('Süzme Yoğurt', 'Eker', '1'), hit('Süzme Yoğurt', 'Sütaş', '2')];
  check(
    "the asked-for brand beats a rival's identical product",
    pickBestMatch('sütaş süzme yoğurt', rivals)?.id,
    '2',
  );
  check(
    '  and a rival still answers when it is all there is',
    pickBestMatch('sütaş süzme yoğurt', [hit('Süzme Yoğurt', 'Eker', '1')])?.id,
    '1',
  );
  check(
    'a brand word alone cannot carry a match',
    pickBestMatch('ülker', [hit('Çikolatalı Gofret', 'Ülker', '3')]),
    null,
  );
  check(
    'the brand completes a match the title only half makes',
    pickBestMatch('ülker çikolatalı gofret', [hit('Çikolatalı Gofret', 'Ülker', '3')])?.id,
    '3',
  );
  check(
    'kilojoules in the kcal field are rejected',
    pickBestMatch('beyaz peynir', [hit('Beyaz Peynir', 'Pınar', '4', 1076)]),
    null,
  );
}


/** What the model says, held to the arithmetic and the bounds it has to obey. */
function modelOutput(): void {
  console.log('\n— reading the model\'s answer —');

  const parse = (items: unknown[], extra: Record<string, unknown> = {}) =>
    validateLlmOutput(JSON.stringify({ normalized_text: '', reasoning: '', confidence: 0.9, language: 'en', items, ...extra }));

  const item = (over: Record<string, unknown>) => ({
    name: 'x',
    local_name: 'x',
    quantity: 1,
    unit: 'serving',
    estimated_grams: 100,
    estimated_per_100g: { kcal: 100, protein: 5, carbs: 10, fat: 4 },
    kind: 'food',
    confidence: 0.9,
    ...over,
  });

  // The bug that logged every weighed line over 100 g as 100 g.
  check(
    'a weighed portion survives the quantity bound',
    parse([item({ quantity: 500, unit: 'g' })]).items[0]?.quantity,
    500,
  );

  // The injection: honest macros, hijacked energy. Three numbers against one.
  check(
    'an energy figure the macros cannot carry is recomputed from them',
    parse([item({ estimated_per_100g: { kcal: 9999, protein: 0.3, carbs: 14, fat: 0.2 } })]).items[0]
      ?.per100g.kcal,
    59,
  );
  check(
    '  and a real one is left alone, however high',
    parse([item({ estimated_per_100g: { kcal: 884, protein: 0, carbs: 0, fat: 100 } })]).items[0]
      ?.per100g.kcal,
    884,
  );
  check(
    '  including a drink whose calories are alcohol, which no macro reports',
    parse([item({ estimated_per_100g: { kcal: 85, protein: 0, carbs: 2.6, fat: 0 } })]).items[0]
      ?.per100g.kcal,
    85,
  );

  // A refusal is an answer about the line, not a broken answer.
  check(
    'a refusal parses as a line with no food in it',
    validateLlmOutput('{"error":"I\'m sorry, but I can\'t comply with that request."}').items.length,
    0,
  );
  check(
    '  but an object that says nothing at all still fails',
    (() => {
      try {
        validateLlmOutput('{"foo":1}');
        return 'parsed';
      } catch {
        return 'threw';
      }
    })(),
    'threw',
  );
}

/** The USDA ranking on its own: the rules that decide which row is the food. */
function usdaMatching(): void {
  console.log('\n— USDA, picking the row —');

  const row = (
    description: string,
    dataType: string,
    kcal: number,
    fdcId = description.length + kcal,
  ): unknown => ({
    fdcId,
    description,
    dataType,
    foodNutrients: [
      { nutrientNumber: '208', value: kcal },
      { nutrientNumber: '203', value: 1 },
      { nutrientNumber: '204', value: 1 },
      { nutrientNumber: '205', value: 10 },
    ],
  });

  // "Croissants, apple" is a croissant: the query's word is a qualifier, not the food.
  check(
    'a row whose primary name is a different food loses to one that is the food',
    rankUsdaMatches('apple', [row('Croissants, apple', 'SR Legacy', 254), row('APPLE', 'Branded', 52)], 1)[0]
      ?.description,
    'APPLE',
  );
  // ...but the canonical table still wins between two rows that are both the food.
  check(
    '  while a canonical row beats a branded one that names the same food',
    rankUsdaMatches('apple', [row('APPLE', 'Branded', 52), row('Apples, raw, with skin', 'SR Legacy', 52)], 1)[0]
      ?.description,
    'Apples, raw, with skin',
  );
  check(
    'a plural in the row still matches the singular the query used',
    rankUsdaMatches('potato', [row('Potatoes, boiled', 'SR Legacy', 87)], 1).length,
    1,
  );
  check(
    'a part of a food is not the food',
    rankUsdaMatches(
      'egg',
      [row('Eggs, Grade A, Large, egg white', 'Foundation', 55), row('Eggs, Grade A, Large, egg whole', 'Foundation', 148)],
      1,
    )[0]?.per100g.kcal,
    148,
  );
  check(
    'a shelf label is stepped over to reach the food under it',
    rankUsdaMatches(
      'coffee',
      [row('COFFEE', 'Branded', 310), row('Beverages, coffee, brewed', 'SR Legacy', 2)],
      1,
    )[0]?.per100g.kcal,
    2,
  );
  check(
    'a dried row is not what a line that said nothing asked for',
    rankUsdaMatches(
      'apple',
      [row('Apples, dried, sulfured', 'SR Legacy', 243), row('Apples, raw', 'SR Legacy', 52)],
      1,
    )[0]?.per100g.kcal,
    52,
  );
  check(
    'an energy figure no food can reach is rejected',
    rankUsdaMatches('oatmeal', [row('OATMEAL', 'Branded', 1580)], 1).length,
    0,
  );
  check(
    'a zero on a lab-measured row is a measurement',
    rankUsdaMatches('tea', [row('Beverages, tea, brewed', 'SR Legacy', 0)], 1).length,
    1,
  );
  check(
    '  and a zero on a transcribed label is a blank field',
    rankUsdaMatches('pepsi', [row('PEPSI', 'Branded', 0)], 1).length,
    0,
  );
}

/** The one thing the words cannot decide: which of two identical descriptions is the food. */
async function plausibility(): Promise<void> {
  console.log('\n— the model\'s estimate as a tie-break —');

  const twin = (id: string, kcal: number): FoodMatch => ({
    provider: 'usda',
    id,
    description: 'GREEK YOGURT',
    detail: 'Branded',
    per100g: { kcal, protein: 10, carbs: 4, fat: 0 },
    matchScore: 1,
    rank: 1,
  });

  // Same description, same rank, same provider. Only the model's estimate separates them.
  const yogurt = await parseRow('x', {
    callLlm: llmStub([
      {
        name: 'greek yogurt',
        local_name: 'greek yogurt',
        quantity: 100,
        unit: 'g',
        estimated_grams: 100,
        estimated_per_100g: { kcal: 59, protein: 10, carbs: 4, fat: 0 },
        kind: 'food',
        confidence: 0.9,
      },
    ], 'en'),
    searchUsda: async () => [twin('high', 467), twin('right', 59)],
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('the model\'s estimate separates two rows the words cannot', yogurt.result.items[0]?.sourceId, 'right');
  check('  and the database still supplies the number', yogurt.result.items[0]?.calories, 59);
}

/**
 * The correction loop: what a person's edit does to a stored parse.
 *
 * Every assertion here runs on a fixture, with no database and no model, because that is
 * the whole claim being made — a correction is arithmetic on data the parse already put on
 * the item. If any of this needed a lookup, the claim would be false.
 */
function corrections(): void {
  console.log('\n— corrections —');

  const candidate = (id: string, description: string, kcal: number): ItemCandidate => ({
    provider: 'usda',
    id,
    description,
    detail: 'Branded',
    per100g: { kcal, protein: 10, carbs: 4, fat: 0 },
  });

  const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
    name: 'greek yogurt',
    quantity: 200,
    unit: 'g',
    grams: 200,
    ml: null,
    kind: 'food',
    calories: 130,
    protein: 20,
    carbs: 8,
    fat: 0,
    source: 'usda',
    sourceId: 'first',
    matchedDescription: 'GREEK YOGURT',
    confidence: 0.72,
    per100g: { kcal: 65, protein: 10, carbs: 4, fat: 0 },
    candidates: [candidate('second', 'GREEK YOGURT', 100), candidate('third', 'GREEK YOGURT', 87)],
    needsReview: true,
    corrected: false,
    ...over,
  });

  const parse = (items: ParsedItem[]): ParseResult => ({
    kind: 'food',
    normalizedText: '200 g greek yogurt',
    reasoning: '',
    confidence: 0.72,
    confidenceLevel: 'medium',
    items,
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
    sources: [],
  });

  const apply = (items: ParsedItem[], ...ops: CorrectionOp[]) => applyCorrections(parse(items), ops);

  // --- picking a different row -------------------------------------------------------
  const picked = apply([item()], { type: 'pick_candidate', itemIndex: 0, candidateIndex: 0 });
  const swapped = picked.result.items[0];

  check('picking a candidate re-points the item at that row', swapped?.sourceId, 'second');
  check('  and re-prices it from the new row, at the same weight', swapped?.calories, 200);
  check('  a person\'s answer is certain', swapped?.confidence, 1);
  check('  and no longer asks to be reviewed', [swapped?.corrected, swapped?.needsReview], [true, false]);
  check(
    '  the displaced row goes back on the list, so the pick is reversible',
    swapped?.candidates.map((c) => c.id),
    ['first', 'third'],
  );
  check('  the totals are the items, re-summed', picked.result.totals.calories, 200);
  check('  and the reference list is rebuilt', picked.result.sources.map((s) => s.sourceId), ['second']);
  check('  the ledger holds the item on both sides', [picked.applied[0]?.type, picked.applied[0]?.before?.sourceId, picked.applied[0]?.after?.sourceId], ['pick_candidate', 'first', 'second']);

  // --- portions ----------------------------------------------------------------------
  const grams = apply([item()], { type: 'set_portion', itemIndex: 0, quantity: 300, unit: 'g', grams: null });

  check('a mass unit converts exactly', grams.result.items[0]?.grams, 300);
  check('  and the calories follow it', grams.result.items[0]?.calories, 195);

  // A unit no table knows. The item was 200 g at quantity 2, so a slice is 100 g — the
  // item's own history is the only measurement of that word anywhere in the system.
  const slices = apply(
    [item({ quantity: 2, unit: 'slice' })],
    { type: 'set_portion', itemIndex: 0, quantity: 3, unit: 'slice', grams: null },
  );

  check('an unknown unit scales by what the item already weighed', slices.result.items[0]?.grams, 300);

  const explicit = apply([item()], { type: 'set_portion', itemIndex: 0, quantity: 1, unit: 'bowl', grams: 250 });

  check('an explicit weight wins over the unit', explicit.result.items[0]?.grams, 250);

  // --- removing and adding -----------------------------------------------------------
  const removed = apply(
    [item(), item({ name: 'honey', sourceId: 'honey', calories: 60, per100g: { kcal: 300, protein: 0, carbs: 80, fat: 0 }, grams: 20 })],
    { type: 'remove_item', itemIndex: 0 },
  );

  check('removing an item compacts the list', removed.result.items.map((i) => i.name), ['honey']);
  check('  and its calories leave the total with it', removed.result.totals.calories, 60);
  check('  the ledger says what was there', removed.applied[0]?.before?.sourceId, 'first');

  const added = apply([item()], {
    type: 'add_item',
    name: 'walnuts',
    quantity: 30,
    unit: 'g',
    kind: 'food',
    grams: null,
    food: candidate('walnut', 'Nuts, walnuts', 654),
  });

  check('an added item is priced from the row it was chosen from', added.result.items[1]?.calories, 196);
  check('  and is recorded with no index, because it had none', added.applied[0]?.itemIndex, -1);

  // --- the batch ---------------------------------------------------------------------
  // The reason indices are frozen: under naive sequential application this would re-portion
  // the honey, because removing item 0 moves it into slot 0.
  const batch = apply(
    [item(), item({ name: 'honey', unit: 'g', quantity: 20, grams: 20, calories: 60 })],
    { type: 'remove_item', itemIndex: 0 },
    { type: 'set_portion', itemIndex: 1, quantity: 40, unit: 'g', grams: null },
  );

  check('a batch resolves every index against the list the person was looking at', batch.result.items.map((i) => [i.name, i.grams]), [['honey', 40]]);

  // --- what is refused ---------------------------------------------------------------
  const refuses = (label: string, code: string, ...ops: CorrectionOp[]): void => {
    try {
      apply([item()], ...ops);
      check(label, 'applied', code);
    } catch (error) {
      check(label, (error as { message?: string }).message, code);
    }
  };

  refuses('an index past the end is refused', 'invalid_item_index', { type: 'remove_item', itemIndex: 7 });
  refuses('a candidate that is not on the list is refused', 'invalid_candidate_index', { type: 'pick_candidate', itemIndex: 0, candidateIndex: 9 });
  refuses(
    'editing a row the same batch just removed is refused',
    'item_already_removed',
    { type: 'remove_item', itemIndex: 0 },
    { type: 'set_portion', itemIndex: 0, quantity: 1, unit: 'g', grams: null },
  );
}

/**
 * The real window, untouched by the checks above: they all ran on a stubbed budget.
 *
 * This asserts the LOCAL half only. The full `takeOffSlot` also takes a slot of a counter
 * shared across instances, and this script runs with the real environment loaded — so
 * asking the full one here would send the assertion to the network and make its result
 * depend on whatever the live counter happened to hold a second earlier. The local window
 * is pure arithmetic and is the half that can be pinned.
 */
function budget(): void {
  console.log('\n— the per-minute window —');

  let granted = 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (takeLocalOffSlot()) {
      granted += 1;
    }
  }

  check('the window holds the minute to eight searches', granted, 8);
}

async function live(names: string[]): Promise<void> {
  console.log('\n— live Open Food Facts —');

  for (const name of names.slice(0, 8)) {
    const found = (await searchOffFood(name, 'tr')) ?? [];
    const best = found[0];

    console.log(
      best === undefined
        ? `${name.padEnd(28)} | no match`
        : `${name.padEnd(28)} | ${best.description} | ${best.detail} | ${best.per100g.kcal} kcal | overlap ${best.matchScore.toFixed(2)} | rank ${best.rank.toFixed(2)}`,
    );
  }
}

/** The whole thing for real: the model, both databases, no cache. One line, one row. */
async function parse(line: string): Promise<void> {
  console.log(`\n— "${line}" —`);

  const outcome = await parseRow(line, { useCache: false });

  for (const item of outcome.result.items) {
    console.log(
      `${item.name.padEnd(22)} | ${String(item.sourceId ?? '-').padEnd(14)} | ${item.source.padEnd(12)} | ${item.calories} cal | ${item.matchedDescription ?? '-'}`,
    );
  }

  console.log(`sources: ${outcome.result.sources.map((source) => `${source.kind}:${source.title}`).join(', ')}`);
  for (const provider of outcome.trace.providers) {
    console.log(
      `${provider.provider.padEnd(6)} | ${provider.lookups} looked up | ${provider.cacheHits} cached | ${provider.skipped} skipped | ${provider.latencyMs ?? '-'} ms`,
    );
  }

  console.log(
    `trace:   ${JSON.stringify({
      source: outcome.trace.source,
      llmMs: outcome.trace.llmLatencyMs,
      totalMs: outcome.trace.totalLatencyMs,
      confidence: outcome.trace.confidence,
    })}`,
  );
}

const args = process.argv.slice(2);

if (args[0] === '--parse') {
  await parse(args.slice(1).join(' '));
} else if (args[0] === '--live') {
  await live(args.slice(1));
} else {
  await offline();
  modelOutput();
  matching();
  usdaMatching();
  await plausibility();
  corrections();
  budget();
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}
