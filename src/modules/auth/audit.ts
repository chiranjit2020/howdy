import { auditLog } from '@db/schema';
import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { logger } from '@/platform/logger';

export type AuditEvent =
  | 'signup'
  | 'email_verified'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'session_revoked'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'legal_accepted'
  | 'appeal_filed'
  | 'deletion_requested'
  | 'deletion_cancelled'
  | 'account_deleted'
  | 'data_exported'
  // Someone who joined with Google confirmed it's them before a sensitive change (no password to type).
  | 'google_confirmed'
  // Two-step sign-in (ADR-040)
  | 'two_step_on'
  | 'two_step_off'
  | 'passkey_added'
  | 'passkey_removed'
  | 'app_added'
  | 'app_removed'
  | 'recovery_codes_renewed'
  | 'recovery_code_used'
  | 'second_step_failed'
  | 'passkey_sign_in_failed';

/** Best-effort append to the security audit trail. Never records IPs, tokens, passwords or message content. */
export async function audit(
  event: AuditEvent,
  info: { userId?: string | null; requestId?: string; meta?: Record<string, string | number | boolean> },
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        event,
        userId: info.userId ?? null,
        requestId: info.requestId ?? null,
        meta: info.meta ?? {},
      });
  } catch (err) {
    logger.error({ event: 'audit.write_failed', audited: event, err });
  }
}

/**
 * Where a person lands after signing in (2026-11-07). The very first time — the end of sign-up, or the first log-in
 * after confirming the email — it is their own profile, to put a face and a few words on it; every time after, Home.
 * Called after this sign-in's `login_success` is written, so a count of one means "this is the first". (The trail keeps
 * a year: someone back after more than a year of silence also lands on their profile once, which suits them too.)
 */
export async function landingAfterSignIn(user: { id: string; handle: string }): Promise<string> {
  try {
    const [row] = await getDb()
      .select({ n: count() })
      .from(auditLog)
      .where(and(eq(auditLog.userId, user.id), eq(auditLog.event, 'login_success')));
    return (row?.n ?? 0) <= 1 ? `/profile/${user.handle}` : '/home';
  } catch {
    return '/home';
  }
}
