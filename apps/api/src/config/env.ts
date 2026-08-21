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

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

/**
 * The cache is optional, but half of it is not. A URL with no token — the shape a copied
 * `.env` takes when only the first line was pasted — would otherwise boot into a client
 * that fails every command, and a failing cache is indistinguishable from no cache at
 * all: both are silent misses. This is the one configuration mistake worth refusing to
 * start over, because its symptom is a bill rather than an error.
 */
if (Boolean(UPSTASH_REDIS_REST_URL) !== Boolean(UPSTASH_REDIS_REST_TOKEN)) {
  throw new Error(
    'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together, or both left blank.',
  );
}

/**
 * The cache used to be reached over `rediss://` through a TCP client. It talks HTTP now,
 * so that variable is not merely renamed — it is unreadable, and an environment still
 * carrying it would boot with no cache and say nothing. Delete once every deployment has
 * moved.
 */
if (process.env.REDIS_URL && !UPSTASH_REDIS_REST_URL) {
  throw new Error(
    'REDIS_URL is no longer read. Replace it with UPSTASH_REDIS_REST_URL and ' +
      'UPSTASH_REDIS_REST_TOKEN from the Upstash console (your database -> "REST API"), ' +
      'or delete it to run without a cache.',
  );
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),

  DATABASE_URL: required('DATABASE_URL'),

  // Optional, and both or neither. With neither set, both caches and the shared rate
  // budgets become no-ops: every parse pays full price and every limit falls back to the
  // process. Upstash's REST credentials, not the `rediss://` connection string — the
  // client talks HTTP now. Console → the database → "REST API".
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  hasRedis: Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN),

  /**
   * Browser origins allowed to send credentialed requests, comma-separated. Blank in
   * development means "any origin", which is what `origin: true` used to do everywhere.
   * In production a blank list is a locked door rather than an open one: the mobile app
   * sends no `Origin` header at all and is unaffected either way, so the only thing an
   * empty allowlist can shut out is a browser — which is exactly the caller the list
   * exists to control.
   */
  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),

  /**
   * How long any one request may run before the client is answered 503. The parse
   * pipeline's own worst case is three LLM attempts plus two food waves, which measured
   * at roughly 91 s — long enough that a phone gives up first and the user retries into
   * a second parse nobody is waiting for.
   */
  REQUEST_TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS ?? 45_000),

  /** Proxy hops to trust for `req.ip`. See the note beside `app.set` in `index.ts`. */
  TRUST_PROXY: Number(process.env.TRUST_PROXY ?? 0),

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
