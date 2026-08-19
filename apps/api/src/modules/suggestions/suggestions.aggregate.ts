/**
 * Turning a user's log into something scoreable. This is the only part of the suggestion
 * engine that touches the database, and it never depends on the current minute — which is
 * what lets the whole fold be cached and re-scored for free as the day moves on.
 */
import { and, eq, gte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { db } from '../../db/index.ts';
import { logEntries, savedMeals } from '../../db/app-schema.ts';
import { canonicalKey } from '../entries/entries.text.ts';
import { HISTORY_DAYS, MINUTES_PER_BUCKET, TIME_BUCKETS } from './suggestions.constants.ts';
import { daysBetween, shiftDay, weekdayOf } from './suggestions.day.ts';
import type { CandidateStats, HistoryAggregate, TogetherPartner } from './suggestions.types.ts';

/** One logged line, cut down to only what ranking needs. */
interface HistoryRow {
  day: number;
  minuteOfDay: number | null;
  text: string;
}

/** Everything gathered for one key before it is frozen into `CandidateStats`. */
interface Draft {
  key: string;
  text: string;
  lastSeenDay: number;
  histogram: number[];
  timedCount: number;
  perDay: Map<number, number>;
  timesToday: number;
  lastMinuteToday: number | null;
  isBookmarked: boolean;
  hasHistory: boolean;
}

/**
 * The history, projected to four small columns.
 *
 * `result` is never selected whole: it is a few kilobytes of items, sources and prose per row,
 * and ninety days of it would be megabytes read from Postgres on every request. Only the
 * normalized wording is needed here, so only that is pulled across.
 */
async function loadHistory(userId: string, day: number): Promise<HistoryRow[]> {
  const from = shiftDay(day, -HISTORY_DAYS);

  return db
    .select({
      day: logEntries.day,
      minuteOfDay: logEntries.minuteOfDay,
      text: sql<string>`coalesce(
        nullif(${logEntries.result}->>'normalizedText', ''),
        ${logEntries.rawText}
      )`,
    })
    .from(logEntries)
    .where(
      and(
        eq(logEntries.userId, userId),
        gte(logEntries.day, from),
        eq(logEntries.status, 'parsed'),
      ),
    );
}

function emptyDraft(key: string, text: string): Draft {
  return {
    key,
    text,
    lastSeenDay: 0,
    histogram: new Array<number>(TIME_BUCKETS).fill(0),
    timedCount: 0,
    perDay: new Map(),
    timesToday: 0,
    lastMinuteToday: null,
    isBookmarked: false,
    hasHistory: false,
  };
}

/**
 * Folds the rows into one draft per key.
 *
 * Today's own rows are counted separately and kept out of every statistic. A day must not be
 * allowed to teach the engine about itself: otherwise this morning's eggs would raise their
 * own frequency and their own time fit, and the list would just mirror what is already on
 * the screen.
 */
function foldHistory(rows: readonly HistoryRow[], today: number): Map<string, Draft> {
  const drafts = new Map<string, Draft>();

  for (const row of rows) {
    const key = canonicalKey(row.text);

    if (key === '') {
      continue;
    }

    let draft = drafts.get(key);

    if (!draft) {
      draft = emptyDraft(key, row.text.trim());
      drafts.set(key, draft);
    }

    if (row.day === today) {
      draft.timesToday += 1;

      if (row.minuteOfDay !== null) {
        draft.lastMinuteToday = Math.max(draft.lastMinuteToday ?? 0, row.minuteOfDay);
      }

      continue;
    }

    draft.hasHistory = true;
    draft.perDay.set(row.day, (draft.perDay.get(row.day) ?? 0) + 1);

    // The freshest wording wins, so a spelling the parser has since improved is what is offered.
    if (row.day >= draft.lastSeenDay) {
      draft.lastSeenDay = row.day;
      draft.text = row.text.trim();
    }

    if (row.minuteOfDay !== null) {
      const bucket = Math.min(TIME_BUCKETS - 1, Math.floor(row.minuteOfDay / MINUTES_PER_BUCKET));

      draft.histogram[bucket] = (draft.histogram[bucket] ?? 0) + 1;
      draft.timedCount += 1;
    }
  }

  return drafts;
}

/**
 * Which keys shared a day with which. Built only for the keys already logged today, since
 * those are the only ones the "you usually have this alongside" term can ask about — so it
 * stays a handful of small maps rather than every pair in the history.
 */
function buildPartners(
  rows: readonly HistoryRow[],
  today: number,
  todayKeys: ReadonlySet<string>,
): TogetherPartner[] {
  if (todayKeys.size === 0) {
    return [];
  }

  const byDay = new Map<number, Set<string>>();

  for (const row of rows) {
    if (row.day === today) {
      continue;
    }

    const key = canonicalKey(row.text);

    if (key === '') {
      continue;
    }

    let keys = byDay.get(row.day);

    if (!keys) {
      keys = new Set();
      byDay.set(row.day, keys);
    }

    keys.add(key);
  }

  const partners = new Map<string, { daysWith: number; coDays: Map<string, number> }>();

  for (const key of todayKeys) {
    partners.set(key, { daysWith: 0, coDays: new Map() });
  }

  for (const keys of byDay.values()) {
    for (const key of keys) {
      const partner = partners.get(key);

      if (!partner) {
        continue;
      }

      partner.daysWith += 1;

      for (const other of keys) {
        if (other !== key) {
          partner.coDays.set(other, (partner.coDays.get(other) ?? 0) + 1);
        }
      }
    }
  }

  return [...partners.values()];
}

function freeze(draft: Draft, today: number): CandidateStats {
  let repeatDays = 0;
  let maxPerDay = 0;
  let sameDowDays = 0;
  let lastDay: number | null = null;
  const todayWeekday = weekdayOf(today);

  for (const [day, count] of draft.perDay) {
    if (count >= 2) {
      repeatDays += 1;
    }

    if (count > maxPerDay) {
      maxPerDay = count;
    }

    if (weekdayOf(day) === todayWeekday) {
      sameDowDays += 1;
    }

    if (lastDay === null || day > lastDay) {
      lastDay = day;
    }
  }

  return {
    key: draft.key,
    text: draft.text,
    isBookmarked: draft.isBookmarked,
    hasHistory: draft.hasHistory,
    distinctDays: draft.perDay.size,
    sameDowDays,
    lastDay,
    histogram: draft.histogram,
    timedCount: draft.timedCount,
    repeatDays,
    maxPerDay,
    timesToday: draft.timesToday,
    lastMinuteToday: draft.lastMinuteToday,
  };
}

/**
 * The whole fold for one user on one day: their candidates, how long they have been logging,
 * and the co-occurrence index for what is already on today's plate.
 */
export async function buildHistoryAggregate(
  userId: string,
  day: number,
): Promise<HistoryAggregate> {
  const [rows, bookmarks] = await Promise.all([
    loadHistory(userId, day),
    db
      .select({ text: savedMeals.text, normalizedKey: savedMeals.normalizedKey })
      .from(savedMeals)
      .where(eq(savedMeals.userId, userId)),
  ]);

  // A row dated in the future is a clock the server cannot arbitrate, so it is simply ignored.
  const usable = rows.filter((row) => daysBetween(row.day, day) >= 0);
  const drafts = foldHistory(usable, day);

  for (const bookmark of bookmarks) {
    const key =
      bookmark.normalizedKey === '' ? canonicalKey(bookmark.text) : bookmark.normalizedKey;

    if (key === '') {
      continue;
    }

    const existing = drafts.get(key);

    if (existing) {
      existing.isBookmarked = true;
      continue;
    }

    // A bookmark nobody has logged yet is still a candidate: saving it was the point.
    const draft = emptyDraft(key, bookmark.text.trim());

    draft.isBookmarked = true;
    drafts.set(key, draft);
  }

  const activeDays = new Set(usable.filter((row) => row.day !== day).map((row) => row.day)).size;
  const todayKeys = new Set(
    [...drafts.values()].filter((draft) => draft.timesToday > 0).map((draft) => draft.key),
  );

  return {
    activeDays,
    candidates: [...drafts.values()].map((draft) => freeze(draft, day)),
    partners: buildPartners(usable, day, todayKeys),
  };
}
