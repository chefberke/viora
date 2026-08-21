/**
 * One JSON line per event on stdout/stderr. It keeps the repo dependency-free while the
 * output stays grep- and machine-readable; a real log shipper can be swapped in later —
 * and one now can be, alongside rather than instead: see `setLogSink`.
 */

/**
 * A second destination for these events, installed at boot when one exists.
 *
 * The latched pairs this module carries — `redis_degraded` / `redis_recovered`,
 * `usda_unavailable` / `usda_recovered`, `circuit_open` / `circuit_closed` — plus
 * `rate_limited` and `request_timeout` are the vocabulary that explains a bad afternoon,
 * and stdout is a fine place to keep them and a poor place to count them. Mirrored, they
 * sit on the same timeline as the parses they explain.
 *
 * It is a hook rather than an import because this file has no dependencies and everything
 * imports it, including the config. `index.ts` connects the two ends.
 */
type Sink = (event: string, fields: Record<string, unknown>) => void;

let sink: Sink | null = null;

/**
 * Events too frequent or too dull to mirror. `request` fires once per request and says
 * nothing a parse span does not already carry, and `listening` happens before there is
 * anything to correlate it with.
 */
const NOT_MIRRORED = new Set(['request', 'listening']);

/** Installs the second destination. Called once, from `index.ts`. */
export function setLogSink(next: Sink | null): void {
  sink = next;
}

function mirror(event: string, fields: Record<string, unknown>): void {
  if (sink === null || NOT_MIRRORED.has(event)) {
    return;
  }

  // A logger that can be brought down by its own second destination is worse than one
  // with a single destination. The line on stdout has already been written by this point.
  try {
    sink(event, fields);
  } catch {
    // Nothing to say about it that would not go through the path that just failed.
  }
}

/** One event, on stdout and — when one is installed — to the sink as well. */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
  mirror(event, fields);
}

/**
 * A readable line for anything that was thrown. Runtime and library failures are real
 * `Error`s and keep their stack; our own thrown values are plain tagged objects, which
 * `String()` would flatten to "[object Object]".
 */
export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  if (typeof error === 'object' && error !== null) {
    return { message: JSON.stringify(error) };
  }

  return { message: String(error) };
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const detail = describeError(error);

  console.error(JSON.stringify({ ts: new Date().toISOString(), event, ...detail, ...fields }));
  mirror(event, { ...detail, ...fields, level: 'error' });
}
