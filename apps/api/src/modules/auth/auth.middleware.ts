import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';

import { auth } from '../../lib/auth.ts';
import { unauthorized } from '../../utils/index.ts';

/** Attaches the request's session to `req.session`, or answers 401. */
export async function requireSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (!session) {
    next(unauthorized());
    return;
  }

  req.session = session;
  next();
}
