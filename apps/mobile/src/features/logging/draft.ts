import { randomUUID } from 'expo-crypto';

/**
 * The draft written in the composer. It is a list, not one block of text: every line is
 * an entry of its own, so what the user writes arrives as one meal per entry.
 *
 * One rule holds the list together, and it lives here rather than in the component: an
 * entry is never blank. Two entries that read the same are left alone — a second burger
 * is a second meal, not a mistake.
 */
export interface DraftEntry {
  /** Stable across edits, so a row keeps its input — and with it its caret — while typed in. */
  id: string;
  text: string;
}

/** What a split leaves behind: the new list, and where the caret goes in it. */
export interface SplitResult {
  entries: DraftEntry[];
  focusId: string;
  /** The character the caret lands on. The end of the row's text when it is left out. */
  focusCaret?: number;
}

export function createEntry(text = ''): DraftEntry {
  // A real UUID, because the row id doubles as the server entry id: the same id makes
  // `PUT /api/entries/:id` idempotent across retries and edits.
  return { id: randomUUID(), text };
}

/** Blank is anything with no writing in it: empty, a space, a tab. */
export function isBlank(text: string): boolean {
  return text.trim() === '';
}

/** The same list with one row rewritten. */
export function withText(
  entries: readonly DraftEntry[],
  id: string,
  text: string,
): DraftEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, text } : entry));
}

/** Seeds the composer from plain lines, dropping the blank ones. Never returns none. */
export function toEntries(lines: readonly string[] = []): DraftEntry[] {
  const entries = lines.filter((line) => !isBlank(line)).map((line) => createEntry(line.trim()));

  return entries.length > 0 ? entries : [createEntry()];
}

/**
 * Re-reads a row once a newline lands in it — from the return key, or from pasted text
 * that carries several lines. The first line stays in the row and every other line opens
 * a row of its own, minus the blank ones.
 *
 * A blank row refuses the return key, because it would be left behind as one. The text
 * stays where it is and no row opens under it, so the caret waits on the line to write.
 */
export function splitEntry(
  entries: readonly DraftEntry[],
  id: string,
  text: string,
): SplitResult {
  const [head = '', ...rest] = text.split('\n');
  const added = rest.filter((line) => !isBlank(line)).map((line) => createEntry(line.trim()));

  // The row keeps its first line. When that line is blank there is nothing to keep, so the
  // first line the paste carried moves up into it and the row is never left empty.
  const promoted = isBlank(head) ? added.shift() : undefined;
  const kept = promoted ? promoted.text : head;

  // The caret only leaves a row that holds something of its own.
  const leaves = !isBlank(kept);

  // A blank last line is the return key asking for the next row to write in.
  const opensRow = leaves && isBlank(rest[rest.length - 1] ?? '');
  const tail = opensRow ? [...added, createEntry()] : added;

  // One newline inside a line is the caret cutting an entry in two, so it belongs at the
  // cut: the start of the text that moved down. More lines than that were pasted, and
  // there the caret follows the pasted text to its end.
  const cutsLine = !opensRow && rest.length === 1 && tail.length === 1;

  return {
    entries: entries.flatMap((entry) => {
      if (entry.id === id) {
        return [{ ...entry, text: leaves ? kept.trim() : kept }, ...tail];
      }

      // A row left blank elsewhere goes with it. The caret is here now, so nothing is
      // being written there.
      return isBlank(entry.text) ? [] : [entry];
    }),
    focusId: tail[tail.length - 1]?.id ?? id,
    focusCaret: cutsLine ? 0 : undefined,
  };
}
