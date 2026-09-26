import { attachDatabasePool } from '@vercel/functions';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../config/env';

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
      // A warm server reuses its open connection for the next request instead of paying the TLS + login handshake again.
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
    });
    // On Vercel, keeps the function alive just long enough to close idle connections cleanly when it is paused, so a
    // later request never picks up a dead one. Does nothing elsewhere (local dev, tests).
    attachDatabasePool(pool);
  }
  return pool;
}

export function getDb(): NodePgDatabase {
  db ??= drizzle(getPool());
  return db;
}

/** Cheap liveness probe used by /api/health. */
export async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('select 1');
    return true;
  } catch {
    return false;
  }
}
