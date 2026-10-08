import { auditLog, reports, users } from '@db/schema';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { runHealthReport } from '@/modules/health';
import { moderatorStanding } from '@/modules/moderation';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';

/**
 * The Security Center (admin only): a read-only view of what the security audit trail and system health already know.
 * No new data is collected — this surfaces `audit_log`, account status and the health checks. The audit trail never
 * holds IPs, tokens or message content, so this works per-account and per-event-type, never per-IP.
 */

/** Admin's standing, mirroring staff: not an admin at all (plain 404), an admin who still needs two-step, or ready. */
export type AdminStanding = 'not_admin' | 'needs_two_step' | 'ready';

export async function adminStanding(userId: string): Promise<AdminStanding> {
  const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (row?.role !== 'admin') return 'not_admin';
  // An admin is also staff, so the moderator two-step gate answers for them too (ADR-040, master prompt §45).
  return (await moderatorStanding(userId)) === 'ready' ? 'ready' : 'needs_two_step';
}

/** Defence in depth: the data function re-checks, so it is safe even if a caller forgot to gate the page. */
async function assertAdmin(userId: string): Promise<void> {
  if ((await adminStanding(userId)) !== 'ready') throw new AppError('NOT_FOUND');
}

/** The security events worth counting on the dashboard, and the sign-in failures among them. */
const COUNTED = [
  'login_failed',
  'second_step_failed',
  'passkey_sign_in_failed',
  'login_success',
  'signup',
  'password_reset_completed',
  'two_step_off',
  'session_revoked',
  'account_deleted',
] as const;

/** Changes that should "be the real person" — an attacker on a session would do these. Shown as a watch list. */
const SENSITIVE = [
  'two_step_off',
  'passkey_removed',
  'app_removed',
  'password_reset_completed',
  'recovery_codes_renewed',
  'account_deleted',
] as const;

/** A real account under a login-guessing attack trips these thresholds in 24h (only real accounts are logged). */
const LOGIN_FAIL_FLAG = 5;
const SECOND_STEP_FLAG = 3;

export interface SecurityEventRow {
  event: string;
  handle: string | null;
  at: string;
  requestId: string | null;
}
export interface SecurityOverview {
  generatedAt: string;
  counts: { event: string; d1: number; d7: number }[];
  flagged: { handle: string; loginFailed: number; secondStepFailed: number }[];
  sensitive: SecurityEventRow[];
  recent: SecurityEventRow[];
  safety: { openReports: number; suspendedAccounts: number };
  health: {
    status: 'ok' | 'warn' | 'fail';
    checks: { id: string; label: string; status: string; detail: string }[];
  };
}

export async function securityOverview(userId: string, now: Date = new Date()): Promise<SecurityOverview> {
  await assertAdmin(userId);
  const db = getDb();
  const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [counts, flaggedRows, sensitive, recent, openReports, suspended, health] = await Promise.all([
    // One pass over the week, with a 24h sub-count per event.
    db
      .select({
        event: auditLog.event,
        d1: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${d1})::int`,
        d7: sql<number>`count(*)::int`,
      })
      .from(auditLog)
      .where(and(inArray(auditLog.event, [...COUNTED]), gte(auditLog.createdAt, d7)))
      .groupBy(auditLog.event),
    // Accounts taking repeated sign-in failures in the last 24h.
    db
      .select({
        handle: users.handle,
        loginFailed: sql<number>`count(*) filter (where ${auditLog.event} = 'login_failed')::int`,
        secondStepFailed: sql<number>`count(*) filter (where ${auditLog.event} = 'second_step_failed')::int`,
      })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.userId))
      .where(
        and(
          gte(auditLog.createdAt, d1),
          inArray(auditLog.event, ['login_failed', 'second_step_failed', 'passkey_sign_in_failed']),
        ),
      )
      .groupBy(users.handle)
      .having(
        sql`count(*) filter (where ${auditLog.event} = 'login_failed') >= ${LOGIN_FAIL_FLAG}
         or count(*) filter (where ${auditLog.event} = 'second_step_failed') >= ${SECOND_STEP_FLAG}`,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(25),
    // Recent "is this really you?" account changes (7d).
    db
      .select({
        event: auditLog.event,
        handle: users.handle,
        at: auditLog.createdAt,
        requestId: auditLog.requestId,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(inArray(auditLog.event, [...SENSITIVE]), gte(auditLog.createdAt, d7)))
      .orderBy(desc(auditLog.createdAt))
      .limit(20),
    // The latest security events of any kind.
    db
      .select({
        event: auditLog.event,
        handle: users.handle,
        at: auditLog.createdAt,
        requestId: auditLog.requestId,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(25),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.status, 'open')),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.status, 'suspended')),
    runHealthReport().catch(() => ({ status: 'fail' as const, checks: [] })),
  ]);

  const iso = (d: Date) => d.toISOString();
  return {
    generatedAt: iso(now),
    counts: counts.map((c) => ({ event: c.event, d1: c.d1, d7: c.d7 })),
    flagged: flaggedRows.map((f) => ({
      handle: f.handle,
      loginFailed: f.loginFailed,
      secondStepFailed: f.secondStepFailed,
    })),
    sensitive: sensitive.map((r) => ({
      event: r.event,
      handle: r.handle,
      at: iso(r.at),
      requestId: r.requestId,
    })),
    recent: recent.map((r) => ({ event: r.event, handle: r.handle, at: iso(r.at), requestId: r.requestId })),
    safety: { openReports: openReports[0]?.n ?? 0, suspendedAccounts: suspended[0]?.n ?? 0 },
    health: {
      status: health.status,
      checks: health.checks.map((c) => ({ id: c.id, label: c.label, status: c.status, detail: c.detail })),
    },
  };
}
