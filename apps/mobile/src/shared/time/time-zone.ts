/** Used when the platform cannot name its own zone, which leaves the clock readable. */
const FALLBACK_TIME_ZONE = 'UTC';

/** The IANA name the device is set to, e.g. `'Europe/Istanbul'`. */
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

const ZONED_PARTS = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
} as const;

/**
 * The same instant, rebuilt as a plain local date carrying the wall clock of `timeZone`.
 *
 * Everything downstream is day and hour arithmetic — which greeting, which date label,
 * which cell is today — and this keeps all of it on the built-in local calls instead of
 * threading a zone through each one. A zone the platform will not accept, such as one
 * held from an older install, leaves the date as it is rather than throwing.
 */
export function toZonedDate(date: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { ...ZONED_PARTS, timeZone }).formatToParts(
      date,
    );

    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);

    // Midnight comes back as hour 24 from the formatters that count 1 to 24.
    return new Date(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour') % 24,
      read('minute'),
    );
  } catch {
    return date;
  }
}
