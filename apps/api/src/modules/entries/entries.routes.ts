import { Router, type Request, type Response } from 'express';

import type {
  CorrectEntryResponse,
  DeleteEntryResponse,
  EntriesResponse,
  LoggedDaysResponse,
  UpsertEntryResponse,
} from '../../types/index.ts';
import { CORRECTION_BUDGET, PARSE_BUDGET, rateLimit } from '../../lib/ratelimit.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import {
  correctEntry,
  deleteEntry,
  listEntries,
  listLoggedDays,
  upsertEntry,
} from './entries.service.ts';
import {
  parseCorrectionsBody,
  parseEntriesQuery,
  parseUpsertBody,
  requireId,
  requireUuid,
} from './entries.validation.ts';

export const entriesRouter: Router = Router();

// The budget is counted against the session, so it has to be taken after the session is
// known — otherwise every logged-in user shares one anonymous bucket keyed by address.
entriesRouter.put(
  '/api/entries/:id',
  requireSession,
  rateLimit(PARSE_BUDGET),
  async (req: Request, res: Response<UpsertEntryResponse>) => {
    const entry = await upsertEntry({
      id: requireUuid(req.params.id),
      user: req.session!.user,
      requestId: req.requestId,
      ...parseUpsertBody(req.body),
    });

    res.json({ entry });
  },
);

/**
 * What the parser got wrong on a row, as the person who ate it sees it.
 *
 * It is a POST rather than a PUT because it is not a replacement: each request appends to a
 * ledger that is never rewritten, and the entry is what that ledger adds up to.
 */
entriesRouter.post(
  '/api/entries/:id/corrections',
  requireSession,
  rateLimit(CORRECTION_BUDGET),
  async (req: Request, res: Response<CorrectEntryResponse>) => {
    const entry = await correctEntry({
      id: requireUuid(req.params.id),
      user: req.session!.user,
      ...parseCorrectionsBody(req.body),
    });

    res.json({ entry });
  },
);

entriesRouter.get(
  '/api/entries',
  requireSession,
  async (req: Request, res: Response<EntriesResponse>) => {
    const entries = await listEntries(req.session!.user.id, parseEntriesQuery(req.query));

    res.json({ entries });
  },
);

/**
 * Which days hold a log. It is what the day-to-day walk on the client is built on, so it
 * is deliberately unbounded: the answer is one number per logged day, and a user who has
 * logged every day for years still fits in a small response.
 */
entriesRouter.get(
  '/api/entries/days',
  requireSession,
  async (req: Request, res: Response<LoggedDaysResponse>) => {
    const days = await listLoggedDays(req.session!.user.id);

    res.json({ days });
  },
);

entriesRouter.delete(
  '/api/entries/:id',
  requireSession,
  async (req: Request, res: Response<DeleteEntryResponse>) => {
    await deleteEntry(req.session!.user.id, requireId(req.params.id));

    res.json({ deleted: true });
  },
);
