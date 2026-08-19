import { Router, type Request, type Response } from 'express';

import type { SuggestionsResponse } from '../../types/index.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import { listSuggestions } from './suggestions.service.ts';
import { parseSuggestionsQuery } from './suggestions.validation.ts';

export const suggestionsRouter: Router = Router();

/**
 * What to offer on an empty composer row. The day and the minute are the client's, not the
 * server's — see the service for why that is not negotiable.
 */
suggestionsRouter.get(
  '/api/suggestions',
  requireSession,
  async (req: Request, res: Response<SuggestionsResponse>) => {
    const { day, minute } = parseSuggestionsQuery(req.query);
    const suggestions = await listSuggestions(req.session!.user.id, day, minute);

    res.json({ suggestions });
  },
);
