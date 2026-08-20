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
  // Optional: with no REDIS_URL both caches become no-ops and every parse pays full price.
  REDIS_URL: process.env.REDIS_URL ?? '',

  BETTER_AUTH_SECRET: required('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: required('BETTER_AUTH_URL'),
  // Optional: the API boots and email sign-in works without Google credentials.
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  hasGoogleCredentials: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),

  LLM_BASE_URL: required('LLM_BASE_URL').replace(/\/+$/, ''),
  LLM_API_KEY: required('LLM_API_KEY'),
  LLM_MODEL: required('LLM_MODEL'),

  USDA_API_KEY: required('USDA_API_KEY'),

  // Optional: Open Food Facts has no API key and no signup. `OFF_ENABLED=false` is the
  // kill switch — the pipeline then runs on USDA alone, exactly as it did before.
  OFF_ENABLED: (process.env.OFF_ENABLED ?? 'true') !== 'false',
  OFF_BASE_URL: (process.env.OFF_BASE_URL ?? 'https://search.openfoodfacts.org').replace(
    /\/+$/,
    '',
  ),
  // Open Food Facts asks every caller to identify itself. An app name and version is what
  // belongs here, optionally a project URL — never a personal email address.
  OFF_USER_AGENT: process.env.OFF_USER_AGENT ?? 'Viora/1.0',
} as const;

export const isProduction = env.NODE_ENV === 'production';
