import { sql } from 'drizzle-orm';
import journal from '@db/migrations/meta/_journal.json';
import { getEnv } from '@/platform/config/env';
import { getDb, getPool } from '@/platform/db';
import { getRedis } from '@/platform/redis';
import { getObjectStore } from '@/platform/storage';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface CheckResult {
  /** Stable id, e.g. "database". */
  id: string;
  /** What a person reads in the report. */
  label: string;
  status: CheckStatus;
  /** One plain sentence. Never secrets, connection strings or personal data. */
  detail: string;
  /** How long the check took, when timing is the point. */
  ms?: number;
}

/** Above these a working service is still reported, but as a warning: slow is the first sign of trouble. */
export const SLOW_MS = { database: 300, redis: 300, storage: 1_500, site: 2_000 } as const;
/** Neon's free plan stores 0.5 GB per project. Warn well before it is full. */
export const DB_STORAGE_LIMIT_MB = 512;
/** More failed sign-ins than this in an hour looks like someone guessing passwords. */
export const FAILED_LOGINS_PER_HOUR = 20;

const since = (start: number) => Math.round(performance.now() - start);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 160);

/**
 * Can we reach Postgres, and how fast? The first query also pays for a new connection and, after a quiet spell, for Neon
 * waking the database up (about half a second on the free plan), so it is reported but only the second, awake query
 * decides "slow". Otherwise the morning digest warned every day about a database that was merely asleep.
 */
export async function checkDatabase(): Promise<CheckResult> {
  const start = performance.now();
  try {
    await getPool().query('select 1');
    const wake = since(start);
    const awake = performance.now();
    await getPool().query('select 1');
    const ms = since(awake);
    const slow = ms > SLOW_MS.database;
    const first = wake > SLOW_MS.database ? ` (the first, which woke it up, took ${wake} ms)` : '';
    return {
      id: 'database',
      label: 'Database',
      status: slow ? 'warn' : 'ok',
      detail: slow ? `Answering, but slowly (${ms} ms).` : `Answering in ${ms} ms${first}.`,
      ms,
    };
  } catch (err) {
    return {
      id: 'database',
      label: 'Database',
      status: 'fail',
      detail: `Unreachable: ${message(err)}`,
      ms: since(start),
    };
  }
}

/** Is every migration in the repo applied to this database? A missed one breaks pages that use the new columns. */
export async function checkMigrations(): Promise<CheckResult> {
  const expected = journal.entries.length;
  try {
    const { rows } = await getPool().query<{ n: string }>(
      'select count(*)::text as n from drizzle.__drizzle_migrations',
    );
    const applied = Number(rows[0]?.n ?? 0);
    if (applied >= expected) {
      return {
        id: 'migrations',
        label: 'Database migrations',
        status: 'ok',
        detail: `All ${expected} applied.`,
      };
    }
    return {
      id: 'migrations',
      label: 'Database migrations',
      status: 'fail',
      detail: `${expected - applied} of ${expected} not applied yet. Run the migrations against production.`,
    };
  } catch (err) {
    return {
      id: 'migrations',
      label: 'Database migrations',
      status: 'warn',
      detail: `Could not read: ${message(err)}`,
    };
  }
}

/** How full is the database? Neon stops accepting writes at the plan's limit. */
export async function checkDatabaseSize(): Promise<CheckResult> {
  try {
    const { rows } = await getPool().query<{ bytes: string }>(
      'select pg_database_size(current_database())::text as bytes',
    );
    const mb = Number(rows[0]?.bytes ?? 0) / (1024 * 1024);
    const pct = Math.round((mb / DB_STORAGE_LIMIT_MB) * 100);
    const status: CheckStatus = pct >= 90 ? 'fail' : pct >= 75 ? 'warn' : 'ok';
    return {
      id: 'database_size',
      label: 'Database storage',
      status,
      detail: `${mb.toFixed(1)} MB of ${DB_STORAGE_LIMIT_MB} MB used (${pct}%).`,
    };
  } catch (err) {
    return {
      id: 'database_size',
      label: 'Database storage',
      status: 'warn',
      detail: `Could not read: ${message(err)}`,
    };
  }
}

/** Redis backs rate limiting, which fails CLOSED: if it is down, sign-in and posting stop working. */
export async function checkRedis(): Promise<CheckResult> {
  const redis = getRedis();
  if (!redis) {
    const prod = getEnv().NODE_ENV === 'production';
    return {
      id: 'redis',
      label: 'Redis (rate limits)',
      status: prod ? 'fail' : 'skip',
      detail: prod ? 'REDIS_URL is not set.' : 'Not configured here (development uses memory).',
    };
  }
  const start = performance.now();
  try {
    await redis.ping();
    const ms = since(start);
    const slow = ms > SLOW_MS.redis;
    return {
      id: 'redis',
      label: 'Redis (rate limits)',
      status: slow ? 'warn' : 'ok',
      detail: slow ? `Answering, but slowly (${ms} ms).` : `Answering in ${ms} ms.`,
      ms,
    };
  } catch (err) {
    return {
      id: 'redis',
      label: 'Redis (rate limits)',
      status: 'fail',
      detail: `Unreachable, so sign-in and posting are refused: ${message(err)}`,
      ms: since(start),
    };
  }
}

/** Photo storage: asks for an object that never exists; "not found" proves the bucket and credentials work. */
export async function checkStorage(): Promise<CheckResult> {
  if (getEnv().STORAGE_DRIVER !== 'r2') {
    return { id: 'storage', label: 'Photo storage', status: 'skip', detail: 'Local files (development).' };
  }
  const start = performance.now();
  try {
    await getObjectStore().size('health/probe.txt');
    const ms = since(start);
    const slow = ms > SLOW_MS.storage;
    return {
      id: 'storage',
      label: 'Photo storage',
      status: slow ? 'warn' : 'ok',
      detail: slow ? `Answering, but slowly (${ms} ms).` : `Answering in ${ms} ms.`,
      ms,
    };
  } catch (err) {
    return {
      id: 'storage',
      label: 'Photo storage',
      status: 'fail',
      detail: `Unreachable: ${message(err)}`,
      ms: since(start),
    };
  }
}

/** Email: without it nobody can confirm an account or reset a password. Only the setup is checked; nothing is sent. */
export async function checkEmail(): Promise<CheckResult> {
  const env = getEnv();
  if (env.MAIL_TRANSPORT === 'resend' && env.RESEND_API_KEY) {
    return {
      id: 'email',
      label: 'Email (Resend)',
      status: 'ok',
      detail: `Configured, sending as ${env.MAIL_FROM}.`,
    };
  }
  const prod = env.NODE_ENV === 'production';
  return {
    id: 'email',
    label: 'Email (Resend)',
    status: prod ? 'fail' : 'skip',
    detail: prod
      ? 'Resend is not configured: confirmation and reset emails cannot go out.'
      : 'Development transport.',
  };
}

/** The public front door, fetched the way a visitor would. Catches a broken deploy even when the services are fine. */
export async function checkSite(fetchImpl: typeof fetch = fetch): Promise<CheckResult> {
  const url = new URL('/gate', getEnv().APP_URL);
  const start = performance.now();
  try {
    const res = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    const ms = since(start);
    if (res.status >= 500) {
      return {
        id: 'site',
        label: 'Website',
        status: 'fail',
        detail: `The sign-in page answered ${res.status}.`,
        ms,
      };
    }
    const slow = ms > SLOW_MS.site;
    return {
      id: 'site',
      label: 'Website',
      status: slow ? 'warn' : 'ok',
      detail: slow ? `Up, but slow to answer (${ms} ms).` : `Up (${res.status} in ${ms} ms).`,
      ms,
    };
  } catch (err) {
    return {
      id: 'site',
      label: 'Website',
      status: 'fail',
      detail: `Not reachable: ${message(err)}`,
      ms: since(start),
    };
  }
}

export interface Activity {
  newAccounts24h: number;
  activeUsers24h: number;
  failedLogins1h: number;
  openReports: number;
}

/** A few counts that say how the app is being used, and whether something needs a person. Counts only, never names. */
export async function readActivity(): Promise<Activity> {
  const { rows } = await getDb().execute<{
    new_accounts: number;
    active_users: number;
    failed_logins: number;
    open_reports: number;
  }>(sql`
    select
      (select count(*)::int from users where created_at > now() - interval '24 hours') as new_accounts,
      (select count(distinct user_id)::int from sessions where last_seen_at > now() - interval '24 hours') as active_users,
      (select count(*)::int from audit_log where event = 'login_failed' and created_at > now() - interval '1 hour') as failed_logins,
      (select count(*)::int from reports where status = 'open') as open_reports
  `);
  const r = rows[0];
  return {
    newAccounts24h: r?.new_accounts ?? 0,
    activeUsers24h: r?.active_users ?? 0,
    failedLogins1h: r?.failed_logins ?? 0,
    openReports: r?.open_reports ?? 0,
  };
}

/** Turns the activity counts into the two things that can need attention. */
export function checkActivity(a: Activity): CheckResult[] {
  return [
    {
      id: 'failed_logins',
      label: 'Failed sign-ins (last hour)',
      status: a.failedLogins1h > FAILED_LOGINS_PER_HOUR ? 'warn' : 'ok',
      detail:
        a.failedLogins1h > FAILED_LOGINS_PER_HOUR
          ? `${a.failedLogins1h} failed sign-ins: someone may be guessing passwords (rate limits are holding them back).`
          : `${a.failedLogins1h} failed.`,
    },
    {
      id: 'reports',
      label: 'Flagged trouble waiting',
      status: a.openReports > 0 ? 'warn' : 'ok',
      detail: a.openReports > 0 ? `${a.openReports} report(s) waiting for a moderator.` : 'None waiting.',
    },
  ];
}
