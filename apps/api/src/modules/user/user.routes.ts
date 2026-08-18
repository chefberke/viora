import { Router, type Request, type Response } from 'express';

import { requireSession } from '../auth/auth.middleware.ts';
import type { MeResponse } from '../../types/index.ts';

export const userRouter: Router = Router();

userRouter.get('/api/me', requireSession, (req: Request, res: Response<MeResponse>) => {
  // requireSession guarantees the session is there.
  res.json({ user: req.session!.user });
});
