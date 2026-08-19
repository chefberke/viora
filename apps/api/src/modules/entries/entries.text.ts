/**
 * How a food line is reduced to something comparable. Two callers want slightly different
 * things from it, so they are two functions rather than one with a flag.
 */

/**
 * Lowercase, unicode-normalize, and collapse whitespace — nothing else. Digits, units
 * and punctuation all change the meaning of a food line ("2 eggs" is not "eggs"),
 * so they stay in the key. This is the cache's key: it must never merge two lines that
 * would parse differently.
 */
export function normalizeInput(text: string): string {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * The key one *thing the user eats* is gathered under. Same as `normalizeInput`, minus
 * trailing punctuation: "2 eggs" and "2 eggs." are one habit, and counting them as two
 * would halve the evidence for both. The parse cache cannot take this shortcut, since a
 * stray full stop is still a different string to send a model.
 */
export function canonicalKey(text: string): string {
  return normalizeInput(text).replace(/[\s.,;:!?]+$/u, '');
}
