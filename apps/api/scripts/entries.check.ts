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
import { closeRedis } from '../src/lib/redis.ts';
import { pickBestMatch, searchOffFood, takeOffSlot } from '../src/modules/entries/entries.off.ts';
import { parseRow } from '../src/modules/entries/entries.pipeline.ts';
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

const never: SearchFood = async () => null;

/** What one database did in that parse. Zeros when it never ran a wave at all. */
function ofProvider(outcome: ParseOutcome, provider: FoodProvider): ProviderTrace {
  return (
    outcome.trace.providers.find((entry) => entry.provider === provider) ?? {
      provider,
      lookups: 0,
      cacheHits: 0,
      skipped: 0,
      latencyMs: null,
    }
  );
}

async function offline(): Promise<void> {
  console.log('\n— pipeline, off the network —');

  const usdaOnly = await parseRow('x', {
    callLlm: llmStub([food('white rice', 'white rice')], 'en'),
    searchUsda: async () => match('usda', 2),
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('USDA answers alone', usdaOnly.result.items[0]?.source, 'usda');
  check('  and carries its id as a string', usdaOnly.result.items[0]?.sourceId, '123456');

  const offOnly = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: never,
    searchOff: async () => match('off', 1.5),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('Open Food Facts answers where USDA cannot', offOnly.result.items[0]?.source, 'off');
  check('  the barcode is the id', offOnly.result.items[0]?.sourceId, '8690504020677');
  check('  the brand travels with the name', offOnly.result.items[0]?.matchedDescription, 'Beyaz Peynir — Pınar');
  check('  and the reference names the right database', offOnly.result.sources[0]?.kind, 'off');

  const neither = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: never,
    searchOff: never,
    takeOffSlot: () => true,
    useCache: false,
  });
  check('with no database the row is a flagged estimate', neither.result.items[0]?.source, 'llm_estimate');
  check('  capped at 0.45', neither.result.items[0]?.confidence, 0.45);

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
    searchUsda: async (name) => (name === 'bread' ? match('usda', 2) : null),
    searchOff: async () => match('off', 1.5),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('a row from two databases traces as mixed', mixed.trace.source, 'mixed');

  console.log('\n— which database takes the item —');

  const margin = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => match('usda', 1.4),
    searchOff: async () => match('off', 1.5),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('at equal fit, a lead inside the margin does not take the row', margin.result.items[0]?.source, 'usda');

  const clear = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => match('usda', 1.0),
    searchOff: async () => match('off', 1.5),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('at equal fit, a lead past the margin does', clear.result.items[0]?.source, 'off');

  // The case the weights alone got wrong: a lab-measured row answering a translated
  // guess used to beat the user's own product however badly it fitted.
  const fit = await parseRow('x', {
    callLlm: llmStub([food('chocolate wafer', 'ülker çikolatalı gofret')]),
    searchUsda: async () => match('usda', 2.0, 0.67),
    searchOff: async () => match('off', 1.5, 1),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('the closer fit takes the row even from the lighter database', fit.result.items[0]?.source, 'off');

  const fitBack = await parseRow('x', {
    callLlm: llmStub([food('cheese', 'beyaz peynir')]),
    searchUsda: async () => match('usda', 1.0, 1),
    searchOff: async () => match('off', 1.5, 0.7),
    takeOffSlot: () => true,
    useCache: false,
  });
  check('  and the rule runs both ways', fitBack.result.items[0]?.source, 'usda');

  console.log('\n— which items are worth a lookup —');

  let englishCalls = 0;
  const english = await parseRow('x', {
    callLlm: llmStub([food('white rice', 'white rice')], 'en'),
    searchUsda: async () => match('usda', 2),
    searchOff: async () => {
      englishCalls += 1;
      return null;
    },
    takeOffSlot: () => true,
    useCache: false,
  });
  check('an English line never reaches Open Food Facts', englishCalls, 0);
  check('  and is counted as skipped', ofProvider(english, 'off').skipped, 1);

  let brandCalls = 0;
  await parseRow('x', {
    callLlm: llmStub([food('coca-cola', 'coke')], 'en'),
    searchUsda: async () => match('usda', 2),
    searchOff: async () => {
      brandCalls += 1;
      return null;
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
    searchUsda: async () => match('usda', 0.6),
    searchOff: async () => {
      localCalls += 1;
      return match('off', 1.5);
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
    searchUsda: async () => match('usda', 0.6),
    searchOff: async () => {
      disabledCalls += 1;
      return match('off', 1.5);
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
      return null;
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

/** The real window, untouched by the checks above: they all ran on a stubbed budget. */
function budget(): void {
  console.log('\n— the per-minute window —');

  let granted = 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (takeOffSlot()) {
      granted += 1;
    }
  }

  check('the window holds the minute to eight searches', granted, 8);
}

async function live(names: string[]): Promise<void> {
  console.log('\n— live Open Food Facts —');

  for (const name of names.slice(0, 8)) {
    const found = await searchOffFood(name, 'tr');

    console.log(
      found === null
        ? `${name.padEnd(28)} | no match`
        : `${name.padEnd(28)} | ${found.description} | ${found.detail} | ${found.per100g.kcal} kcal | overlap ${found.matchScore.toFixed(2)} | rank ${found.rank.toFixed(2)}`,
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
  matching();
  budget();
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exitCode = failures === 0 ? 0 : 1;
}

// The cache module opens a Redis client the moment it is imported, and an open client
// holds the event loop. Without this the script prints its result and then hangs.
await closeRedis();
