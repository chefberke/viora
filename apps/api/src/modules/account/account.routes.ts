import { Router, type Request, type Response } from 'express';

import { db } from '../../db/index.ts';
import { accountDeletionFeedback, isDeletionReason } from '../../db/app-schema.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import { badRequest } from '../../utils/index.ts';
import type { DeletionFeedbackResponse } from '../../types/index.ts';

export const accountRouter: Router = Router();

// Separate from `/api/auth/delete-user`, which strips unknown body fields. The client
// calls it first, so the answer survives a deletion that then fails.
accountRouter.post(
  '/api/account/deletion-feedback',
  requireSession,
  async (req: Request, res: Response<DeletionFeedbackResponse>) => {
    // Express 5 leaves `req.body` undefined when no parser matched the content type, so
    // a request sent without one destructured off undefined and answered 500. Every other
    // route in the API reaches its body through a guard that tolerates a non-object; this
    // one read it raw.
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as {
      reason?: unknown;
    };

    if (!isDeletionReason(body.reason)) {
      throw badRequest('invalid_reason');
    }

    const user = req.session!.user;

    await db.insert(accountDeletionFeedback).values({
      id: crypto.randomUUID(),
      userId: user.id,
      reason: body.reason,
    });

    res.status(201).json({ recorded: true });
  },
);
