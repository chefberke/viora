/**
 * Turning a run into something a person reads: a console summary while you work, a
 * markdown file the README can quote, and a comparison against an earlier run so a change
 * to the prompt or the matcher has to show its effect before it is kept.
 */
import { isAccuracyFailure } from './taxonomy.ts';
import type { CaseScore, RunReport } from './types.ts';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** A rate with nothing behind it is reported as unmeasured, never as zero. */
function rate(value: number, measured: number): string {
  return measured === 0 ? 'n/a (0 measured)' : `${percent(value)}  (n=${measured})`;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : `${text}${' '.repeat(width - text.length)}`;
}

/** The failing items of one case, in the form "what was wanted -> what came back". */
function describeFailures(score: CaseScore): string[] {
  const lines: string[] = [];

  if (score.runFailure !== null) {
    lines.push(`    run failed: ${score.runFailure}`);
  }

  for (const code of score.failures) {
    lines.push(`    ${code}`);
  }

  for (const verdict of score.verdicts) {
    const real = verdict.failures.filter((code) => code !== 'ungrounded_fallback');

    if (real.length === 0) {
      continue;
    }

    const wanted = verdict.expected === null ? '(not expected)' : verdict.expected.names[0] ?? '?';
    const got = verdict.predictedName ?? '(missing)';

    lines.push(`    ${pad(real.join(','), 20)} ${wanted} -> ${got}`);
  }

  return lines;
}

export function printReport(report: RunReport, showCases: boolean): void {
  const rows: Array<[string, string]> = [
    ['cases', String(report.caseCount)],
    ['pass rate', percent(report.passRate)],
    ['item precision', percent(report.items.precision)],
    ['item recall', percent(report.items.recall)],
    ['item F1', percent(report.items.f1)],
    ['portion in band', rate(report.portion.gramsInBandRate, report.coverage.portionChecked)],
    ['portion MAPE', percent(report.portion.gramsMape)],
    ['item kcal in band', rate(report.energy.itemKcalInBandRate, report.coverage.itemKcalChecked)],
    ['item kcal MAPE', percent(report.energy.itemKcalMape)],
    ['row kcal in band', rate(report.energy.rowKcalInBandRate, report.coverage.rowKcalChecked)],
    ['row kcal MAPE', percent(report.energy.rowKcalMape)],
    ['kind accuracy', percent(report.kindAccuracy)],
    ['unit family accuracy', rate(report.unitFamilyAccuracy, report.coverage.unitFamilyChecked)],
    ['grounding rate', percent(report.groundingRate)],
    ['adversarial rejection', rate(report.adversarialRejectionRate, report.coverage.adversarialCases)],
    ['calibration error', report.calibration.ece.toFixed(3)],
    [
      'latency p50 / p95',
      report.mode === 'record'
        ? `${report.latency.p50TotalMs} ms / ${report.latency.p95TotalMs} ms`
        : 'n/a (replay does no I/O)',
    ],
    ['tokens in / out', `${report.tokens.prompt} / ${report.tokens.completion}`],
  ];

  console.log(`\n  ${report.model}  prompt ${report.promptVersion}.${report.promptFingerprint}  (${report.mode})\n`);

  for (const [label, value] of rows) {
    console.log(`  ${pad(label, 24)}${value}`);
  }

  console.log('\n  source mix');

  for (const [source, count] of Object.entries(report.sourceMix).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${pad(`  ${source}`, 24)}${count}`);
  }

  if (report.failures.length > 0) {
    console.log('\n  failures');

    for (const failure of report.failures) {
      console.log(`  ${pad(`  ${failure.code}`, 24)}${pad(String(failure.count), 6)}${failure.reason}`);
    }
  }

  console.log('\n  calibration  (confidence -> observed accuracy)');

  for (const bin of report.calibration.bins) {
    const width = Math.round(bin.observedAccuracy * 20);

    console.log(
      `  ${pad(`  ${bin.floor.toFixed(1)}-${(bin.floor + 0.1).toFixed(1)}`, 24)}` +
        `${pad(percent(bin.observedAccuracy), 8)}${pad(`n=${bin.count}`, 8)}${'#'.repeat(width)}`,
    );
  }

  console.log('\n  by tag');

  for (const tag of report.byTag) {
    console.log(`  ${pad(`  ${tag.tag}`, 24)}${pad(percent(tag.passRate), 8)}n=${tag.cases}`);
  }

  if (showCases) {
    const failed = report.cases.filter((score) => !score.passed);

    if (failed.length > 0) {
      console.log(`\n  ${failed.length} failing case(s)\n`);

      for (const score of failed) {
        console.log(`  ${score.case.id}  "${score.case.input}"`);

        for (const line of describeFailures(score)) {
          console.log(line);
        }
      }
    }
  }

  console.log('');
}

export function toMarkdown(report: RunReport): string {
  const lines: string[] = [
    `# Parse accuracy — ${report.createdAt}`,
    '',
    `Model \`${report.model}\`, prompt \`${report.promptVersion}.${report.promptFingerprint}\`, ` +
      `${report.caseCount} ${report.caseCount === 1 ? 'case' : 'cases'}, ` +
      `${report.mode === 'replay' ? 'replayed from committed fixtures' : 'recorded against the live providers'}.`,
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Cases passed | ${percent(report.passRate)} |`,
    `| Item precision / recall / F1 | ${percent(report.items.precision)} / ${percent(report.items.recall)} / ${percent(report.items.f1)} |`,
    `| Portion within band | ${percent(report.portion.gramsInBandRate)} |`,
    `| Item calories within band | ${percent(report.energy.itemKcalInBandRate)} |`,
    `| Row calories within band | ${percent(report.energy.rowKcalInBandRate)} |`,
    `| Row calorie MAPE | ${percent(report.energy.rowKcalMape)} |`,
    `| Kind accuracy | ${percent(report.kindAccuracy)} |`,
    `| Unit family accuracy | ${percent(report.unitFamilyAccuracy)} |`,
    `| Grounding rate | ${percent(report.groundingRate)} |`,
    `| Adversarial rejection | ${rate(report.adversarialRejectionRate, report.coverage.adversarialCases)} |`,
    `| Expected calibration error | ${report.calibration.ece.toFixed(3)} |`,
    ...(report.mode === 'record'
      ? [`| Latency p50 / p95 | ${report.latency.p50TotalMs} ms / ${report.latency.p95TotalMs} ms |`]
      : []),
    '',
    '## Failure taxonomy',
    '',
    '| Code | Count | What it means |',
    '| --- | --- | --- |',
  ];

  for (const failure of report.failures) {
    lines.push(`| \`${failure.code}\` | ${failure.count} | ${failure.reason} |`);
  }

  lines.push('', '## Confidence calibration', '', '| Confidence | Items | Observed accuracy |', '| --- | --- | --- |');

  for (const bin of report.calibration.bins) {
    lines.push(
      `| ${bin.floor.toFixed(1)}–${(bin.floor + 0.1).toFixed(1)} | ${bin.count} | ${percent(bin.observedAccuracy)} |`,
    );
  }

  lines.push('', '## By category', '', '| Tag | Cases | Pass rate |', '| --- | --- | --- |');

  for (const tag of report.byTag) {
    lines.push(`| \`${tag.tag}\` | ${tag.cases} | ${percent(tag.passRate)} |`);
  }

  return `${lines.join('\n')}\n`;
}

/** How far a metric may fall before a comparison calls it a regression. */
const REGRESSION_TOLERANCE = 0.02;

export interface Comparison {
  rows: Array<{ metric: string; before: number; after: number; delta: number; regressed: boolean }>;
  regressed: boolean;
}

export function compare(before: RunReport, after: RunReport): Comparison {
  // Every metric here is "higher is better" except the two error measures, which are
  // negated so one rule covers the table.
  const metrics: Array<[string, (report: RunReport) => number]> = [
    ['pass rate', (report) => report.passRate],
    ['item F1', (report) => report.items.f1],
    ['portion in band', (report) => report.portion.gramsInBandRate],
    ['item kcal in band', (report) => report.energy.itemKcalInBandRate],
    ['row kcal in band', (report) => report.energy.rowKcalInBandRate],
    ['kind accuracy', (report) => report.kindAccuracy],
    ['unit family accuracy', (report) => report.unitFamilyAccuracy],
    ['grounding rate', (report) => report.groundingRate],
    ['adversarial rejection', (report) => report.adversarialRejectionRate],
    ['calibration (1-ECE)', (report) => 1 - report.calibration.ece],
  ];

  const rows = metrics.map(([metric, read]) => {
    const from = read(before);
    const to = read(after);
    const delta = to - from;

    return { metric, before: from, after: to, delta, regressed: delta < -REGRESSION_TOLERANCE };
  });

  return { rows, regressed: rows.some((row) => row.regressed) };
}

export function printComparison(comparison: Comparison): void {
  console.log('\n  metric                  before    after     change');

  for (const row of comparison.rows) {
    const arrow = row.delta > 0.0005 ? '+' : row.delta < -0.0005 ? '' : ' ';

    console.log(
      `  ${pad(row.metric, 24)}${pad(percent(row.before), 10)}${pad(percent(row.after), 10)}` +
        `${arrow}${(row.delta * 100).toFixed(1)}pp${row.regressed ? '   REGRESSION' : ''}`,
    );
  }

  console.log('');
}

export { isAccuracyFailure };
