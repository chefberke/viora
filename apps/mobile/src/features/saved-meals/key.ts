/**
 * The same reduction the server groups meals under, mirrored here so the bookmark button can
 * tell whether the entry in front of it is already saved without asking. It has to stay in
 * step with `canonicalKey` in `apps/api/src/modules/entries/entries.text.ts`.
 */
export function canonicalKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?]+$/u, '');
}
