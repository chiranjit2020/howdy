import { reports } from '@db/schema';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { ReportReason } from '@/shared/validation/moderation';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** Reporting is cheap to abuse (a flood buries real reports), so it is limited per reporter. Fails closed. */
export const RATE = { report: rule(10, 86_400) } as const;

/**
 * File a report against a user ("Flag trouble"). Foundation for the Phase 11 moderation queue: nothing here acts on the
 * report or informs the reported person. Repeating a report while one is still open is a harmless no-op (one open report
 * per reporter/target), so the caller cannot tell whether it was new, and cannot flood the queue.
 */
export async function createReport(
  reporterId: string,
  targetUserId: string,
  reason: ReportReason,
  details?: string,
  /** A snapshot of the words being reported (a Post Card), kept so the evidence outlives the card. */
  evidenceText?: string,
): Promise<void> {
  if (reporterId === targetUserId)
    throw new AppError('BAD_REQUEST', { message: 'You cannot report yourself.' });
  await enforceRateLimit(`report:${reporterId}`, RATE.report);
  await getDb()
    .insert(reports)
    .values({
      reporterId,
      targetUserId,
      reason,
      details: details && details.length > 0 ? details : null,
      evidenceText: evidenceText && evidenceText.length > 0 ? evidenceText.slice(0, 160) : null,
    })
    .onConflictDoNothing();
}
