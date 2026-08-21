/**
 * The eval runner.
 *
 *   npm run eval                          replay every case offline, no API keys needed
 *   npm run eval -- --filter tr_unit      one category
 *   npm run eval -- --case tr-ayran -v    one case, with the failing items printed
 *   npm run eval:record                   fill in up to 25 unrecorded cases, then replay
 *   npm run eval -- --compare baseline latest
 *   npm run eval -- --braintrust           also push the run as a Braintrust experiment
 *
 * Replay is the default everywhere, on purpose. Recording spends a metered model quota
 * and a shared Open Food Facts budget, so it never happens unless it is asked for by
 * name, it never re-records a case that is already on disk, and it stops at `--limit`.
 * A run that hits the limit says so and exits non-zero rather than quietly scoring a
 * partial set as if it were the whole thing.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../src/config/index.ts';
import { isPipelineError } from '../src/modules/entries/entries.errors.ts';
import { parseRow } from '../src/modules/entries/entries.pipeline.ts';
import { PROMPT_FINGERPRINT, PROMPT_VERSION } from '../src/modules/entries/entries.versions.ts';
import { CassetteMiss, createSession, isReplayable, loadCassette } from './cassette.ts';
import { GOLD_CASES } from './gold/cases.ts';
import { buildReport, scoreCase } from './score.ts';
import { compare, printComparison, printReport, toMarkdown } from './report.ts';
import type { EvalFailure } from './taxonomy.ts';
import type { CaseScore, GoldTag, RunReport } from './types.ts';

const REPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'reports');

const DEFAULT_RECORD_LIMIT = 25;

interface Options {
  record: boolean;
  limit: number;
  filter: GoldTag | null;
  caseId: string | null;
  verbose: boolean;
  name: string;
  compare: [string, string] | null;
  /** Leave unrecorded cases out of the run instead of scoring them as failures. */
  skipUnrecorded: boolean;
  /** Record the food side only. Never calls the metered model. */
  noLlm: boolean;
  /**
   * Also push the run to Braintrust as an experiment.
   *
   * Off by default and asked for by name, like `--record`. Everything else about this
   * command works with fake keys and no network, and that property is worth more than the
   * convenience of a default that dials out.
   */
  braintrust: boolean;
}

function readOptions(argv: string[]): Options {
  const options: Options = {
    record: argv.includes('--record'),
    limit: DEFAULT_RECORD_LIMIT,
    filter: null,
    caseId: null,
    verbose: argv.includes('-v') || argv.includes('--verbose'),
    name: 'latest',
    compare: null,
    skipUnrecorded: argv.includes('--skip-unrecorded'),
    noLlm: argv.includes('--no-llm'),
    braintrust: argv.includes('--braintrust'),
  };

  for (const [index, argument] of argv.entries()) {
    const next = argv[index + 1];

    if (argument === '--limit' && next !== undefined) {
      options.limit = Number(next);
    }

    if (argument === '--filter' && next !== undefined) {
      options.filter = next as GoldTag;
    }

    if (argument === '--case' && next !== undefined) {
      options.caseId = next;
    }

    if (argument === '--name' && next !== undefined) {
      options.name = next;
    }

    if (argument === '--compare' && next !== undefined && argv[index + 2] !== undefined) {
      options.compare = [next, argv[index + 2]!];
    }
  }

  return options;
}

function reportPath(name: string, extension: string): string {
  return join(REPORT_DIR, `${name}.${extension}`);
}

function loadReport(name: string): RunReport {
  return JSON.parse(readFileSync(reportPath(name, 'json'), 'utf8')) as RunReport;
}

/** A run's own failure code, kept apart from a parse that merely came back wrong. */
function failureOf(error: unknown): EvalFailure {
  if (isPipelineError(error)) {
    return error.code;
  }

  return 'unexpected_error';
}

async function run(options: Options): Promise<number> {
  const cases = GOLD_CASES.filter((goldCase) => {
    if (options.caseId !== null) {
      return goldCase.id === options.caseId;
    }

    if (options.filter !== null) {
      return goldCase.tags.includes(options.filter);
    }

    return true;
  });

  if (cases.length === 0) {
    console.error('no cases matched');

    return 1;
  }

  const session = createSession(() => new Date().toISOString());
  const scores: CaseScore[] = [];

  let newlyRecorded = 0;
  let notRecorded = 0;
  let missing = 0;

  // Set the moment a provider says 429. Recording then stops dead instead of walking the
  // rest of the set into the same wall: on a metered free tier every further attempt is
  // quota spent to be told "no" again, and the earlier answers are already safe on disk.
  let quotaExhausted = false;

  for (const goldCase of cases) {
    const cassette = loadCassette(goldCase.id, goldCase.input);
    const ready = isReplayable(cassette);

    if (!ready && !options.record) {
      missing += 1;

      // A case with no fixture is an unknown, not a wrong answer. Counting it as a
      // failure would understate the parser on a partially recorded set; leaving it in
      // silently would overstate coverage. So it is either scored as a failure or left
      // out entirely, and the report always says how many were left out.
      if (!options.skipUnrecorded) {
        scores.push(scoreCase(goldCase, null, null, 'unexpected_error'));
      }

      continue;
    }

    if (!ready && options.record && (newlyRecorded >= options.limit || quotaExhausted)) {
      notRecorded += 1;
      scores.push(scoreCase(goldCase, null, null, 'unexpected_error'));
      continue;
    }

    if (!ready) {
      newlyRecorded += 1;
      console.log(`  recording ${goldCase.id}  "${goldCase.input}"`);
    }

    try {
      const outcome = await parseRow(
        goldCase.input,
        session.deps(cassette, options.record, !options.noLlm),
      );

      scores.push(scoreCase(goldCase, outcome.result, outcome.trace, null));

      if (options.record) {
        session.finish(cassette, true);
      }
    } catch (error) {
      if (error instanceof CassetteMiss) {
        missing += 1;
      }

      const failure = failureOf(error);

      if (failure === 'rate_limited') {
        quotaExhausted = true;
        console.log(`  rate limited on ${goldCase.id} — stopping. Re-run later to continue.`);
      }

      scores.push(scoreCase(goldCase, null, null, failure));

      // Whatever was fetched before the failure is still worth keeping: the next run
      // resumes from it instead of paying for those calls again.
      if (options.record) {
        session.finish(cassette, false);
      }
    }
  }

  const report = buildReport(scores, {
    createdAt: new Date().toISOString(),
    model: env.LLM_MODEL,
    promptVersion: PROMPT_VERSION,
    promptFingerprint: PROMPT_FINGERPRINT,
    mode: options.record ? 'record' : 'replay',
  });

  printReport(report, options.verbose || options.caseId !== null);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(reportPath(options.name, 'json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(reportPath(options.name, 'md'), toMarkdown(report));

  console.log(`  written  eval/reports/${options.name}.json  eval/reports/${options.name}.md`);

  // After the report is on disk, never instead of it. A push that fails must not cost the
  // run its numbers, so this is the last thing that happens and its failure is a message
  // rather than an exit code: the eval measured what it measured either way.
  if (options.braintrust) {
    if (!env.hasBraintrust) {
      console.error('  --braintrust needs BRAINTRUST_API_KEY. Nothing was pushed.');
    } else {
      try {
        const { pushExperiment } = await import('./braintrust.ts');

        console.log(`  experiment  ${await pushExperiment(scores, report, options.name)}`);
      } catch (error) {
        console.error(`  braintrust push failed: ${String(error)}`);
      }
    }
  }

  if (options.record) {
    console.log(
      `  quota spent  llm ${session.spend.llm}  usda ${session.spend.usda}  off ${session.spend.off}`,
    );
  }

  if (notRecorded > 0) {
    const why = quotaExhausted
      ? 'the provider rate limit was reached'
      : `--limit ${options.limit} was reached`;

    console.log(`\n  ${notRecorded} case(s) left unrecorded: ${why}. Run npm run eval:record again to continue.`);

    return 1;
  }

  if (missing > 0) {
    const what = options.skipUnrecorded
      ? `${missing} case(s) left out of these numbers for want of a cassette`
      : `${missing} case(s) have no usable cassette`;

    console.log(`\n  ${what}. Run: npm run eval:record`);

    return 1;
  }

  return 0;
}

const options = readOptions(process.argv.slice(2));

let code = 0;

if (options.compare !== null) {
  const [beforeName, afterName] = options.compare;
  const comparison = compare(loadReport(beforeName), loadReport(afterName));

  console.log(`\n  ${beforeName} -> ${afterName}`);
  printComparison(comparison);

  code = comparison.regressed ? 1 : 0;
} else {
  code = await run(options);
}

process.exitCode = code;
