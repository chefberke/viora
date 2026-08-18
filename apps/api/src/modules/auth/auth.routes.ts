import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';

import { auth } from '../../lib/auth.ts';

export const authRouter: Router = Router();

// `*splat` is Express 5 syntax; the Express 4 form (`/api/auth/*`) throws at startup.
// Mount this router before `express.json()`, or every auth request hangs.
authRouter.all('/api/auth/*splat', toNodeHandler(auth));
