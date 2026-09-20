import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../config/env';

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

export function getPool(): Pool {
  pool ??= new Pool({
    connectionString: getEnv().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
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
