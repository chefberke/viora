import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs as its own process and never sees the server's `--env-file` flag, so
// `dotenv/config` is what gives it DATABASE_URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/app-schema.ts'],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
