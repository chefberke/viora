/**
 * The eval run, mirrored to Braintrust as an experiment.
 *
 * Strictly a second renderer over `CaseScore[]`. It computes nothing: every judgement was
 * already made by `scoreCase`, and if this file ever disagreed with `report.ts` about
 * whether a case passed, one of them would be lying. The markdown reports and
 * `--compare baseline latest` remain the source of truth; this adds a place to click into
 * a single case and see what the model was given, what it answered, and which rows the
 * ranker chose between.
 *
 * It runs only behind `--braintrust`. That is not politeness — `npm run eval` is the one
 * command in this repository that is guaranteed to work offline, with fake keys and no
 * network, and it produces the numbers the whole accuracy story rests on. A default that
 * dialled out would put a third party between the instrument and its readings.
 */
import { initExperiment } from 'braintrust';

import { env } from '../src/config/index.ts';
import { FAILURE_REASON, isAccuracyFailure } from './taxonomy.ts';
import type { CaseScore, RunReport } from './types.ts';

/**
 * The share of expected items the parse got entirely right.
 *
 * `ungrounded_fallback` does not count against it, for the same reason `scoreCase` treats
 * it as informational: falling back to the model's own numbers is the designed behaviour
 * for a food no database holds, not an error. It is reported separately as `grounded`.
 */
function itemAccuracy(score: CaseScore): number {
  if (score.expectedCount === 0) {
    return score.predictedCount === 0 ? 1 : 0;
  }

  const clean = score.verdicts.filter(
    (verdict) =>
      verdict.expected !== null &&
      verdict.failures.every((failure) => failure === 'ungrounded_fallback'),
  ).length;

  return clean / score.expectedCount;
}

/** The share of items priced from a real database row rather than the model's guess. */
function groundedShare(score: CaseScore): number | null {
  const items = score.result?.items ?? [];

  if (items.length === 0) {
    return null;
  }

  return items.filter((item) => item.source !== 'llm_estimate').length / items.length;
}

/**
 * Every code this case earned, on the row and on its items, deduplicated.
 *
 * They become tags rather than twelve inverted 0/1 scorers. A scorer called `wrong_food`
 * would have to read 1 when the food was right, which is the kind of inversion that gets
 * misread in a dashboard exactly once and then believed for a month. A tag says what
 * happened, filters in one click, and needs no legend.
 */
function failureTags(score: CaseScore): string[] {
  const codes = new Set<string>(score.failures);

  for (const verdict of score.verdicts) {
    for (const failure of verdict.failures) {
      codes.add(failure);
    }
  }

  if (score.runFailure !== null) {
    codes.add(score.runFailure);
  }

  return [...codes].map((code) => `fail:${code}`);
}

/** The human-readable half of the taxonomy, so a row explains itself without the docs. */
function failureReasons(score: CaseScore): Record<string, string> {
  const reasons: Record<string, string> = {};

  for (const tag of failureTags(score)) {
    const code = tag.slice('fail:'.length);

    if (isAccuracyFailure(code as never)) {
      reasons[code] = FAILURE_REASON[code as keyof typeof FAILURE_REASON];
    }
  }

  return reasons;
}

/**
 * Pushes one experiment and returns its URL.
 *
 * `update: true` on a named run so that re-running `--braintrust --name phase6` twice does
 * not leave two experiments a person has to tell apart by timestamp. The default name is
 * the report name, which is how the two artefacts stay findable from each other.
 */
export async function pushExperiment(
  scores: readonly CaseScore[],
  report: RunReport,
  name: string,
): Promise<string> {
  const experiment = initExperiment({
    apiKey: env.BRAINTRUST_API_KEY,
    ...(env.BRAINTRUST_PROJECT_ID
      ? { projectId: env.BRAINTRUST_PROJECT_ID }
      : { project: 'viora' }),
    experiment: name,
    update: true,
    // The fingerprint that decides whether two runs are comparable at all. A prompt edit
    // changes `promptFingerprint` and invalidates the model leg of every cassette, so two
    // experiments with different fingerprints are measuring different systems.
    metadata: {
      model: report.model,
      prompt_version: report.promptVersion,
      prompt_fingerprint: report.promptFingerprint,
      mode: report.mode,
      cases: scores.length,
      // Aggregate by construction — it needs the whole run's bins — so it cannot be a row
      // score and is recorded here instead. See `calibration` in `score.ts`.
      ece: report.calibration.ece,
    },
  });

  for (const score of scores) {
    const grounded = groundedShare(score);

    experiment.log({
      input: score.case.input,
      expected: score.case.expect,
      output: score.result,
      scores: {
        passed: score.passed ? 1 : 0,
        item_accuracy: itemAccuracy(score),
        ...(grounded === null ? {} : { grounded }),
      },
      tags: [...score.case.tags.map((tag) => `tag:${tag}`), ...failureTags(score)],
      metadata: {
        case_id: score.case.id,
        lang: score.case.lang,
        gold_tags: [...score.case.tags],
        notes: score.case.notes ?? null,
        run_failure: score.runFailure,
        failure_reasons: failureReasons(score),
        source: score.trace?.source ?? null,
        llm_cache_hit: score.trace?.llmCacheHit ?? null,
      },
      metrics: {
        expected_items: score.expectedCount,
        predicted_items: score.predictedCount,
        matched_items: score.matched,
        ...(score.trace?.promptTokens === null || score.trace?.promptTokens === undefined
          ? {}
          : { prompt_tokens: score.trace.promptTokens }),
        ...(score.trace?.completionTokens === null || score.trace?.completionTokens === undefined
          ? {}
          : { completion_tokens: score.trace.completionTokens }),
      },
    });
  }

  // Flush before summarising: the summary reads the rows back, and a background flusher
  // that has not caught up would summarise an experiment that is still half-empty.
  await experiment.flush();

  const summary = await experiment.summarize({ summarizeScores: false });

  // A self-hosted or otherwise link-less deployment returns no URL. The rows are still
  // there; only the shortcut to them is missing.
  return summary.experimentUrl ?? '(pushed, no link available)';
}
