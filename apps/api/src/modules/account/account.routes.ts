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
    const { reason } = req.body as { reason?: unknown };

    if (!isDeletionReason(reason)) {
      throw badRequest('invalid_reason');
    }

    const user = req.session!.user;

    await db.insert(accountDeletionFeedback).values({
      id: crypto.randomUUID(),
      userId: user.id,
      email: user.email,
      reason,
    });

    res.status(201).json({ recorded: true });
  },
);
