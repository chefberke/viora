/**
 * Bookmarked meals: the list, and the two ways one is written.
 *
 * Bookmarking hands over the parse the entry already had, so nothing is re-parsed and the
 * button answers instantly. Editing the text sends no parse, and the line goes back through
 * the ordinary pipeline — the snapshot is only ever as old as the text it describes.
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { savedMeals } from '../../db/app-schema.ts';
import type { SavedMealDto, SaveMealRequest } from '../../types/index.ts';
import { notFound } from '../../utils/index.ts';
import { isPipelineError, toHttpError } from '../entries/entries.errors.ts';
import { parseRow } from '../entries/entries.pipeline.ts';
import { canonicalKey } from '../entries/entries.text.ts';

function toDto(row: typeof savedMeals.$inferSelect): SavedMealDto {
  return {
    id: row.id,
    text: row.text,
    status: row.status as SavedMealDto['status'],
    result: row.result ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSavedMeals(userId: string): Promise<SavedMealDto[]> {
  const rows = await db.query.savedMeals.findMany({
    where: eq(savedMeals.userId, userId),
    orderBy: [asc(savedMeals.createdAt)],
  });

  return rows.map(toDto);
}

export async function saveMeal(
  userId: string,
  id: string,
  body: SaveMealRequest,
): Promise<SavedMealDto> {
  const existing = await db.query.savedMeals.findFirst({ where: eq(savedMeals.id, id) });

  // Someone else's id: pretend it does not exist rather than confirm it does.
  if (existing && existing.userId !== userId) {
    throw notFound();
  }

  let result = body.result ?? null;
  let status: SavedMealDto['status'] = result ? 'parsed' : 'failed';

  // No snapshot means the text is new or edited, so it has to be read again. A failure is
  // stored rather than thrown: the meal is still saved, it just has no figures yet.
  if (!result) {
    try {
      const outcome = await parseRow(body.text);

      result = outcome.result;
      status = 'parsed';
    } catch (error) {
      if (!isPipelineError(error)) {
        throw error;
      }

      throw toHttpError(error);
    }
  }

  const normalizedKey = canonicalKey(body.text);
  const values = {
    text: body.text,
    normalizedKey,
    status,
    result,
    sourceEntryId: body.sourceEntryId ?? null,
    updatedAt: new Date(),
  };

  // An edit that leaves the meal the same meal is a plain update. It cannot go through the
  // upsert below: the row would collide on its own primary key as well as on the unique key,
  // and only one of the two can be the arbiter.
  if (existing && existing.normalizedKey === normalizedKey) {
    await db.update(savedMeals).set(values).where(eq(savedMeals.id, id));

    return toDto({ ...existing, ...values });
  }

  // An edit that turns it into a different meal gives up its row first, so that the upsert
  // below can merge into whatever already holds the new key rather than fighting it.
  if (existing) {
    await db.delete(savedMeals).where(eq(savedMeals.id, id));
  }

  // Bookmarking the same meal twice is not an error, it is the same bookmark. The normalized
  // text is the identity, so a re-save under a fresh client id lands on the existing row —
  // and an edit that collides with another saved meal merges into it instead of duplicating.
  await db
    .insert(savedMeals)
    .values({ id, userId, ...values })
    .onConflictDoUpdate({ target: [savedMeals.userId, savedMeals.normalizedKey], set: values });

  const stored = await db.query.savedMeals.findFirst({
    where: and(eq(savedMeals.userId, userId), eq(savedMeals.normalizedKey, normalizedKey)),
  });

  if (!stored) {
    throw notFound();
  }

  return toDto(stored);
}

/** Idempotent: unbookmarking something that is already gone is still a success. */
export async function deleteSavedMeal(userId: string, id: string): Promise<void> {
  await db.delete(savedMeals).where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)));
}
