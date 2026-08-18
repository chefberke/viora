import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { env, isProduction } from '../config/index.ts';
import { db } from '../db/index.ts';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  // Pairs with `expoClient()` in the mobile app; the two only work together.
  plugins: [expo()],

  // Deletes on the spot: no mail provider, so an email verification could never arrive.
  user: {
    deleteUser: { enabled: true },
  },

  // The app confirms deletion by typing DELETE, not a password. With the default freshness
  // gate every returning user would get SESSION_EXPIRED from `/delete-user` instead.
  session: {
    freshAge: 0,
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  socialProviders: env.hasGoogleCredentials
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {},

  trustedOrigins: [
    'viora://',
    ...(isProduction ? [] : ['exp://', 'exp://**', 'exp://192.168.*.*:*/**']),
  ],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session['user'];
