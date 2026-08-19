import cors from 'cors';
import express from 'express';

import { env } from './config/index.ts';
import { closeDatabase } from './db/index.ts';
import { closeRedis } from './lib/redis.ts';
import { accountRouter } from './modules/account/account.routes.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { entriesRouter } from './modules/entries/entries.routes.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { savedMealsRouter } from './modules/saved-meals/saved-meals.routes.ts';
import { suggestionsRouter } from './modules/suggestions/suggestions.routes.ts';
import { userRouter } from './modules/user/user.routes.ts';
import { errorHandler, log, requestId } from './utils/index.ts';

const app = express();

// `credentials: true` lets the browser leg of the Google OAuth redirect send the cookie.
app.use(cors({ origin: true, credentials: true }));
app.use(requestId);

// Must stay above express.json(): Better Auth reads the raw request body itself.
app.use(authRouter);
app.use(express.json());

app.use(healthRouter);
app.use(userRouter);
app.use(accountRouter);
app.use(entriesRouter);
app.use(savedMealsRouter);
app.use(suggestionsRouter);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  log('listening', { url: `http://localhost:${env.PORT}` });
});

// In-flight requests finish, then the pools close — a deploy never drops a parse midway.
function shutdown(signal: string): void {
  log('shutdown', { signal });

  server.close(() => {
    void Promise.allSettled([closeDatabase(), closeRedis()]).then(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
