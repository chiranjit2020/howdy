import { auditLog } from '@db/schema';
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
