import { feedback, profiles, users } from '@db/schema';
import { and, desc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { adminStanding } from '@/modules/admin';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { runAfterResponse } from '@/platform/background';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { getMailer } from '@/platform/mailer';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  FEEDBACK_KIND_LABEL,
  type FeedbackKind,
  type FeedbackStatus,
  type SendFeedback,
} from '@/shared/validation/feedback';

/**
 * Feedback about Howdy itself (ADR-059). Anyone signed in may send it (limited, so it cannot be used to flood the
 * team); admins read it in the Control Room, and each one is also emailed to them. Text only: no photos.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const RATE = { send: rule(5, 3600), sendDaily: rule(20, 86_400), manage: rule(300, 3600) } as const;

/** Kept this long after it was sent (the Privacy Policy's figure), then the purge job deletes it. */
export const FEEDBACK_RETENTION_DAYS = 365;

/** Who is told: every active, confirmed admin, and the operator's report address if one is set (as security alerts). */
async function recipients(): Promise<string[]> {
  const admins = await getDb()
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), isNotNull(users.emailVerifiedAt)));
  const owner = getEnv().HEALTH_REPORT_TO;
  return [...new Set([...(owner ? [owner] : []), ...admins.map((a) => a.email.toLowerCase())])];
}

/** Send feedback as `userId`. The limits are spent first; the email to the team goes after the response. */
export async function sendFeedback(userId: string, input: SendFeedback): Promise<{ id: string }> {
  await enforceRateLimit(`feedback:send:${userId}`, RATE.send);
  await enforceRateLimit(`feedback:day:${userId}`, RATE.sendDaily);
  await enforceNewAccountLimit(userId, 'feedback');
  const [row] = await getDb()
    .insert(feedback)
    .values({ userId, kind: input.kind, body: input.body, page: input.page ?? null })
    .returning({ id: feedback.id });
  runAfterResponse('feedback.email', async () => {
    const [who] = await getDb()
      .select({ handle: users.handle, displayName: profiles.displayName })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    const from = who ? `${who.displayName ?? who.handle} (@${who.handle})` : 'A member';
    const subject = `Howdy feedback: ${FEEDBACK_KIND_LABEL[input.kind]}`;
    const text = [
      `${from} sent feedback.`,
      '',
      `Kind: ${FEEDBACK_KIND_LABEL[input.kind]}`,
      ...(input.page ? [`Page: ${input.page}`] : []),
      '',
      input.body,
      '',
      `Read and mark it in the Control Room: ${getEnv().APP_URL}/admin/feedback`,
    ].join('\n');
    for (const to of await recipients()) await getMailer().send({ to, subject, text });
  });
  return { id: row!.id };
}

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  body: string;
  page: string | null;
  status: FeedbackStatus;
  createdAt: string;
  from: { handle: string; displayName: string } | null;
}

/** Not an admin, or an admin without two-step: the same 404 as everywhere else in the Control Room. */
async function requireAdmin(userId: string) {
  if ((await adminStanding(userId)) !== 'ready') throw new AppError('NOT_FOUND');
}

/** Newest first, for the Control Room. Admins with two-step only. */
export async function listFeedback(adminId: string): Promise<{ items: FeedbackItem[]; unread: number }> {
  await requireAdmin(adminId);
  const db = getDb();
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: feedback.id,
        kind: feedback.kind,
        body: feedback.body,
        page: feedback.page,
        status: feedback.status,
        createdAt: feedback.createdAt,
        handle: users.handle,
        displayName: profiles.displayName,
      })
      .from(feedback)
      .leftJoin(users, eq(users.id, feedback.userId))
      .leftJoin(profiles, eq(profiles.userId, feedback.userId))
      .orderBy(desc(feedback.createdAt))
      .limit(200),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(eq(feedback.status, 'new')),
  ]);
  return {
    unread: counted?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind as FeedbackKind,
      body: r.body,
      page: r.page,
      status: r.status as FeedbackStatus,
      createdAt: r.createdAt.toISOString(),
      from: r.handle ? { handle: r.handle, displayName: r.displayName ?? r.handle } : null,
    })),
  };
}

/** Mark one read or done (or new again). Admins with two-step only. */
export async function setFeedbackStatus(adminId: string, id: string, status: FeedbackStatus): Promise<void> {
  await enforceRateLimit(`feedback:manage:${adminId}`, RATE.manage);
  await requireAdmin(adminId);
  const rows = await getDb()
    .update(feedback)
    .set({ status, handledAt: status === 'new' ? null : new Date() })
    .where(eq(feedback.id, id))
    .returning({ id: feedback.id });
  if (rows.length === 0) throw new AppError('NOT_FOUND');
}

/** My own feedback, for my data export. */
export async function myFeedback(userId: string) {
  return getDb()
    .select({ kind: feedback.kind, body: feedback.body, page: feedback.page, createdAt: feedback.createdAt })
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt));
}

/** Retention: feedback older than a year. */
export async function purgeOldFeedback(now: Date = new Date()): Promise<{ feedback: number }> {
  const cutoff = new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * 86_400_000);
  const rows = await getDb()
    .delete(feedback)
    .where(lt(feedback.createdAt, cutoff))
    .returning({ id: feedback.id });
  return { feedback: rows.length };
}
