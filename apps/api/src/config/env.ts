function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/api/.env.example to apps/api/.env and fill it in.`,
    );
  }
  return value;
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),

  DATABASE_URL: required('DATABASE_URL'),
  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: required('BETTER_AUTH_URL'),

  // Optional: the API boots and email sign-in works without Google credentials.
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  hasGoogleCredentials: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
} as const;

export const isProduction = env.NODE_ENV === 'production';
