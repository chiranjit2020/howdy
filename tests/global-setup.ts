import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Bring the TEST database up to date before any test runs. Refuses to touch anything that is not clearly a test DB. */
export default async function setup(): Promise<void> {
  config({ path: '.env.local', quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return; // UI/unit-only runs need no database
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test'))
    throw new Error(`Refusing to migrate "${dbName}": TEST_DATABASE_URL must point at a *_test database`);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'db/migrations' });
  } finally {
    await pool.end();
  }
}
