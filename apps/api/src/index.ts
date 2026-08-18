import cors from 'cors';
import express from 'express';

import { env } from './config/index.ts';
import { accountRouter } from './modules/account/account.routes.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { userRouter } from './modules/user/user.routes.ts';
import { errorHandler } from './utils/index.ts';

const app = express();

// `credentials: true` lets the browser leg of the Google OAuth redirect send the cookie.
app.use(cors({ origin: true, credentials: true }));

// Must stay above express.json(): Better Auth reads the raw request body itself.
app.use(authRouter);
app.use(express.json());

app.use(healthRouter);
app.use(userRouter);
app.use(accountRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
