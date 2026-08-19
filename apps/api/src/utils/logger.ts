/**
 * One JSON line per event on stdout/stderr. It keeps the repo dependency-free while the
 * output stays grep- and machine-readable; a real log shipper can be swapped in later.
 */
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
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
}
