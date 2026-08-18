import { Router, type Request, type Response } from 'express';

import type { HealthResponse, HelloResponse } from '../../types/index.ts';

/** Unauthenticated on purpose. */
export const healthRouter: Router = Router();

healthRouter.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/api/hello', (_req: Request, res: Response<HelloResponse>) => {
  res.json({ message: 'Hello World' });
});
