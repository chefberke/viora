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

/**
 * Tokens for measuring how well a food name matches a database description. Turkish
 * letters are folded onto ASCII first, because the plain split treats `ç ğ ı ö ş ü` as
 * separators: "çorbası" would reduce to "orbas", and every overlap score on Turkish text
 * would be meaningless.
 *
 * NEVER wire this into `normalizeInput` or `canonicalKey`. Those two back the Redis keys
 * and the unique index on `saved_meals.normalized_key`; folding them would orphan every
 * saved meal and split every habit in two.
 */
export function foldTokens(text: string): string[] {
  return (
    text
      // Lowercase first: 'İ' only decomposes into a strippable mark once it is lowercased.
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      // `ı` carries no combining mark, so NFD leaves it untouched.
      .replace(/ı/g, 'i')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1)
  );
}
