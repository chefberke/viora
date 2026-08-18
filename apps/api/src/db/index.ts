import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../config/index.ts';

import * as authSchema from './schema.ts';
import * as appSchema from './app-schema.ts';

const schema = { ...authSchema, ...appSchema };

// One pool for the whole process; `pg` queues queries when every connection is busy.
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });

export { schema };

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
