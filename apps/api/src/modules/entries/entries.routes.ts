import { Router, type Request, type Response } from 'express';

import type {
  DeleteEntryResponse,
  EntriesResponse,
  LoggedDaysResponse,
  UpsertEntryResponse,
} from '../../types/index.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import { deleteEntry, listEntries, listLoggedDays, upsertEntry } from './entries.service.ts';
import { parseEntriesQuery, parseUpsertBody, requireId, requireUuid } from './entries.validation.ts';

export const entriesRouter: Router = Router();

entriesRouter.put(
  '/api/entries/:id',
  requireSession,
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
