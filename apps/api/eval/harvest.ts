/**
 * Turns real corrections into proposed gold cases.
 *
 *   npm run eval:harvest
 *   npm run eval:harvest -- --limit 50 --since 2026-08-01
 *
 * This is the flywheel the whole correction loop was built for. The gold set is 126 cases
 * because one person sat down and wrote 126 cases, and every number this project reports is
 * measured against them. A person correcting their own lunch produces the same thing for
 * free — a line, and a human's word on what it should have parsed to — and produces it about
 * the foods people actually eat rather than the ones an author thought of.
 *
 * It reads the entry's CURRENT parse, not the `before`/`after` snapshots on the ledger rows.
 * The ledger says what changed; the entry says what the person settled on, which is the
 * label. Both matter and they are not the same: a row corrected twice has two ledger
 * entries and one answer.
 *
 * Nothing here writes into `gold/cases.ts`. A harvested case is a PROPOSAL, and a human
 * accepts it. Letting a script append to the set that measures the system would mean the
 * instrument and the thing it measures share an author, which is the one property an
 * instrument must not have — and the two times this harness caught itself being wrong, it
 * was because a human was still reading it.
 *
 * Privacy: this reads raw meal text against a user id. Retention and anonymisation are
 * Phase 5's problem, and this script is one of the reasons that table is worth the care.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { desc, eq, gte } from 'drizzle-orm';

import { closeDatabase, db } from '../src/db/index.ts';
import { entryCorrections, logEntries } from '../src/db/app-schema.ts';
import { MASS_UNIT_GRAMS, VOLUME_UNIT_ML } from '../src/modules/entries/entries.portion.ts';
import type { CorrectionType, ParsedItem, ParseResult } from '../src/types/index.ts';
import { sha256 } from '../src/utils/index.ts';
import { GOLD_CASES } from './gold/cases.ts';
import type { Band, GoldCase, GoldTag, UnitFamily } from './types.ts';

const PROPOSED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'gold', 'proposed');

/** A ceiling on the read, so a busy month cannot pull the whole table into memory. */
const MAX_ROWS = 5000;
const DEFAULT_LIMIT = 50;

/**
 * How wide a harvested band is.
 *
 * A weight a person typed in grams is exact and gets almost no room. Everything else is a
 * portion they described rather than measured — "a bowl", "two slices" — so the band has to
 * hold the width of the word, not the width of their typing. Energy is looser again,
 * because two rows for the same food disagree by more than a portion ever does.
 */
const EXACT_TOLERANCE = 0.03;
const PORTION_TOLERANCE = 0.15;
const ENERGY_TOLERANCE = 0.2;

function band(value: number, tolerance: number): Band {
  return [Math.round(value * (1 - tolerance)), Math.round(value * (1 + tolerance))];
}

function unitFamily(unit: string): UnitFamily {
  if (MASS_UNIT_GRAMS[unit] !== undefined) {
    return 'mass';
  }

  return VOLUME_UNIT_ML[unit] !== undefined ? 'volume' : 'count';
}

/**
 * The names a parse would have to produce to count as this food.
 *
 * The matched row's first comma segment goes in beside the item's own name: USDA writes
 * `Primary, qualifier, qualifier`, so the first segment is the food and the rest is which
 * one of it — and a later parse that picks a different qualifier of the same food is right.
 */
function namesOf(item: ParsedItem): string[] {
  const names = [item.name.toLowerCase()];
  const primary = item.matchedDescription?.split(',')[0]?.trim().toLowerCase();

  if (primary !== undefined && primary !== '' && !names.includes(primary)) {
    names.push(primary);
  }

  return names;
}

function expectedItem(item: ParsedItem): GoldCase['expect']['items'][number] {
  const family = unitFamily(item.unit);
  const tolerance = family === 'mass' ? EXACT_TOLERANCE : PORTION_TOLERANCE;

  return {
    names: namesOf(item),
    kind: item.kind,
    ...(item.kind === 'water'
      ? { ml: band(item.ml ?? 0, tolerance) }
      : {
          grams: band(item.grams ?? 0, tolerance),
          kcal: band(item.calories, ENERGY_TOLERANCE),
        }),
    unitFamily: family,
  };
}

/** Only what can be read off the parse itself. Every other tag is a judgement, so a human makes it. */
function tagsOf(result: ParseResult): GoldTag[] {
  const tags: GoldTag[] = [];

  if (result.kind === 'water') {
    tags.push('water');
  }

  if (result.items.length > 1) {
    tags.push('multi_item');
  }

  if (result.items.some((item) => item.source === 'off')) {
    tags.push('brand');
  }

  return tags;
}

/**
 * What is doubtful about this case, said out loud on the case itself.
 *
 * A correction is a label about a PARSE, and not every correction is. Someone who types
 * "200g greek yogurt" and then sets the weight to 300 g has not told us the parser misread
 * a mass unit — a mass unit converts exactly and cannot be misread — they have told us they
 * ate more than they wrote. Harvested as-is, that becomes a gold case whose expectation
 * contradicts its own input, and a case like that does not measure the parser: it makes it
 * fail for being right.
 *
 * These are not dropped, because the reviewer is the one who can tell which happened, and a
 * case silently discarded teaches nobody anything. They are labelled.
 */
function suspicions(types: ReadonlySet<CorrectionType>, result: ParseResult): string[] {
  const notes: string[] = [];

  if (types.has('set_portion') && result.items.some((item) => unitFamily(item.unit) === 'mass')) {
    notes.push(
      'SUSPECT: a portion was corrected on a line that names an exact weight. Check the input still describes the meal before trusting the grams band.',
    );
  }

  if (types.has('add_item')) {
    notes.push(
      'SUSPECT: an item was added by hand. It may be a food the line never named, in which case it belongs in the input rather than the expectation.',
    );
  }

  return notes;
}

/** Not a language detector. A line with no Latin-1 letters outside ASCII is probably English. */
function guessLanguage(input: string): GoldCase['lang'] {
  return /^[\x20-\x7e]*$/.test(input) ? 'en' : 'tr';
}

function readOptions(argv: string[]): { limit: number; since: Date | null } {
  let limit = DEFAULT_LIMIT;
  let since: Date | null = null;

  for (const [index, arg] of argv.entries()) {
    if (arg === '--limit') {
      limit = Number(argv[index + 1] ?? DEFAULT_LIMIT);
    }

    if (arg === '--since') {
      const parsed = new Date(argv[index + 1] ?? '');

      since = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  return { limit, since };
}

function render(cases: GoldCase[], createdAt: string): string {
  const header = `/**
 * Proposed gold cases, harvested from real corrections on ${createdAt}.
 *
 * NOT part of the gold set. Every case here is a machine's reading of what a person meant,
 * and it has to be read by a person before it measures anything:
 *
 *   1. Is the line worth keeping, and is it free of anything private?
 *   2. Are the bands right? They were widened from one parse, not from knowing the food.
 *   3. Which tags does it deserve? Only the ones readable off the parse are filled in.
 *   4. Does the id collide with nothing in \`cases.ts\`? (Checked at harvest, check again.)
 *
 * Then move it into \`gold/cases.ts\` by hand and delete it from here.
 */
import type { GoldCase } from '../../types.ts';

export const PROPOSED_CASES: readonly GoldCase[] = `;

  return `${header}${JSON.stringify(cases, null, 2)} as const;\n`;
}

async function harvest(): Promise<number> {
  const { limit, since } = readOptions(process.argv.slice(2));
  const rows = await db
    .select({
      entryId: entryCorrections.entryId,
      type: entryCorrections.type,
      createdAt: entryCorrections.createdAt,
      rawText: logEntries.rawText,
      status: logEntries.status,
      result: logEntries.result,
    })
    .from(entryCorrections)
    .innerJoin(logEntries, eq(entryCorrections.entryId, logEntries.id))
    .where(since === null ? undefined : gte(entryCorrections.createdAt, since))
    .orderBy(desc(entryCorrections.createdAt))
    .limit(MAX_ROWS);

  const byEntry = new Map<string, { row: (typeof rows)[number]; types: Set<CorrectionType> }>();

  for (const row of rows) {
    const seen = byEntry.get(row.entryId);

    if (seen === undefined) {
      byEntry.set(row.entryId, { row, types: new Set([row.type as CorrectionType]) });
      continue;
    }

    seen.types.add(row.type as CorrectionType);
  }

  const known = new Set(GOLD_CASES.map((goldCase) => goldCase.id));
  const knownInputs = new Set(GOLD_CASES.map((goldCase) => goldCase.input.trim().toLowerCase()));
  const cases: GoldCase[] = [];
  let skipped = 0;

  for (const { row, types } of byEntry.values()) {
    if (cases.length >= limit) {
      break;
    }

    const result = row.result;

    // A row whose parse failed, or that was corrected down to nothing, says what the answer
    // is NOT. That is a real signal and this is not the file that can carry it.
    if (row.status !== 'parsed' || result === null || result.items.length === 0) {
      skipped += 1;
      continue;
    }

    const id = `h-${sha256(row.rawText).slice(0, 8)}`;

    if (known.has(id) || knownInputs.has(row.rawText.trim().toLowerCase())) {
      skipped += 1;
      continue;
    }

    known.add(id);
    cases.push({
      id,
      input: row.rawText,
      lang: guessLanguage(row.rawText),
      tags: tagsOf(result),
      expect: {
        items: result.items.map(expectedItem),
        kind: result.kind,
        totalKcal: band(result.totals.calories, ENERGY_TOLERANCE),
      },
      notes: [
        `Harvested from a correction (${[...types].sort().join(', ')}).`,
        'Bands and tags need a human.',
        ...suspicions(types, result),
      ].join(' '),
    });
  }

  if (cases.length === 0) {
    console.log(`no new cases  (${rows.length} correction row(s) read, ${skipped} skipped)`);

    return 0;
  }

  const createdAt = new Date().toISOString().slice(0, 10);
  const path = join(PROPOSED_DIR, `${createdAt}.ts`);

  mkdirSync(PROPOSED_DIR, { recursive: true });
  writeFileSync(path, render(cases, createdAt));

  console.log(`${cases.length} proposed case(s), ${skipped} skipped, from ${rows.length} correction row(s)`);
  console.log(`written  ${path}`);
  console.log('Read every one of them before moving any into gold/cases.ts.');

  return 0;
}

process.exitCode = await harvest();

await closeDatabase();
