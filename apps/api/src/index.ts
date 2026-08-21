import cors from 'cors';
import express from 'express';

import { env, isProduction } from './config/index.ts';
import { closeDatabase } from './db/index.ts';
import { flushBraintrust, initBraintrust, mirrorEvent } from './lib/braintrust.ts';
import { accountRouter } from './modules/account/account.routes.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { entriesRouter } from './modules/entries/entries.routes.ts';
import { foodsRouter } from './modules/foods/foods.routes.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { savedMealsRouter } from './modules/saved-meals/saved-meals.routes.ts';
import { suggestionsRouter } from './modules/suggestions/suggestions.routes.ts';
import { userRouter } from './modules/user/user.routes.ts';
import { errorHandler, log, requestId, requestTimeout, setLogSink } from './utils/index.ts';

// Tracing starts before anything can be traced, and only here. Every other module reaches
// it through `lib/braintrust.ts`, whose helpers do nothing until this line has run — which
// is what keeps `npm run eval` and `npm run check` off the network even on a machine whose
// `.env` holds a key.
initBraintrust();
setLogSink(mirrorEvent);

const app = express();

/**
 * Who may send a credentialed browser request.
 *
 * `credentials: true` lets the browser leg of the Google OAuth redirect send the cookie,
 * and that is precisely why the origin can no longer be `true` — reflecting back whatever
 * origin asked, with credentials, is a same-origin policy that agrees with everyone.
 *
 * Four clauses, and each one is load-bearing:
 *
 * 1. No `Origin` header at all is allowed. That is the mobile app, curl, and every
 *    server-to-server caller — none of them is a browser, and a CORS header protects
 *    none of them. Denying these would break the product to defend something absent.
 * 2. An origin on the list is allowed.
 * 3. Anything else is refused by answering `false`, NOT by raising. The `cors` package
 *    forwards a thrown error to the error handler, which would turn a disallowed origin
 *    into a 500 and a false `unhandled_error` line. Refusing means omitting the header
 *    and letting the browser enforce it, which is how CORS is supposed to work.
 * 4. An empty list reflects any origin in development and allows none in production.
 *    A blank variable is what a fresh checkout has, and the friendly reading of that is
 *    right locally and wrong in front of the internet.
 *
 * This is not Better Auth's `trustedOrigins` (`lib/auth.ts`), which governs where an
 * OAuth redirect may land. Editing one to fix the other will not work.
 */
app.use(
  cors({
    origin(origin, callback) {
      if (origin === undefined) {
        callback(null, true);
        return;
      }

      if (env.CORS_ORIGINS.length === 0) {
        callback(null, !isProduction);
        return;
      }

      callback(null, env.CORS_ORIGINS.includes(origin));
    },
    credentials: true,
  }),
);

// Decides what `req.ip` is, which is the identity a rate limit falls back to. Left at 0
// the address is the socket's, which is right when the API is exposed directly and wrong
// behind a proxy — where every request would look like the proxy and share one budget.
// Taking `x-forwarded-for` unconditionally is worse: any caller could then mint a fresh
// identity per request and the limit would look enforced while enforcing nothing.
app.set('trust proxy', env.TRUST_PROXY);

app.use(requestId);
app.use(requestTimeout);

// Must stay above express.json(): Better Auth reads the raw request body itself.
app.use(authRouter);

// A meal line is capped at 500 characters and the largest body anything here accepts is a
// parse result with twenty items. 64kb is far above both and far below what an unbounded
// parser will happily buffer on behalf of someone who is not sending food at all.
app.use(express.json({ limit: '64kb' }));

app.use(healthRouter);
app.use(userRouter);
app.use(accountRouter);
app.use(entriesRouter);
app.use(foodsRouter);
app.use(savedMealsRouter);
app.use(suggestionsRouter);

app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  log('listening', { url: `http://localhost:${env.PORT}` });
});

// Node's own default is five minutes, which is five minutes a connection can hold a socket
// while dribbling a request nobody asked for. Nothing here legitimately takes thirty
// seconds to finish SENDING; the slow part is always what happens afterwards, and that is
// what `requestTimeout` above bounds.
server.requestTimeout = 30_000;

// In-flight requests finish, then the pool closes — a deploy never drops a parse midway.
// Only the database is waited on: the cache client talks HTTP and holds nothing open.
function shutdown(signal: string): void {
  log('shutdown', { signal });

  server.close(() => {
    // Both, and neither blocking the other. The spans are batched in memory: the SDK ships
    // them on `beforeExit`, which a SIGTERM does not reach, so without this line the traces
    // missing from Braintrust would be exactly the ones from the minutes before a deploy.
    void Promise.allSettled([closeDatabase(), flushBraintrust()]).finally(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
