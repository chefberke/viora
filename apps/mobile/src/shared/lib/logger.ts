/**
 * One JSON line per event, the same shape the API's `utils/logger.ts` emits.
 *
 * The app had no logging at all and swallowed five failures outright — a delete that never
 * happened, a refresh that silently did not, a saved meal that could not be read. Each was
 * a deliberate `.catch(() => {})` with a comment explaining why the *user* need not be
 * told, and each was right about that and wrong to leave nothing behind: "a miss costs
 * nothing" is a claim nobody could check.
 *
 * It stays a `console` call rather than a crash reporter. Adding Sentry would mean a
 * vendor, a DSN, a privacy question about what a meal line is, and a build change; the
 * shape below is what a reporter would want anyway, so swapping one in later is a change
 * to this file alone. In development it lands in the Metro console, which is where a
 * person is already looking.
 */
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }

  if (typeof error === 'object' && error !== null) {
    return { message: JSON.stringify(error) };
  }

  return { message: String(error) };
}

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  console.error(JSON.stringify({ ts: new Date().toISOString(), event, ...describeError(error), ...fields }));
}
