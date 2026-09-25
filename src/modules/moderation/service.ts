import { auditLog, postCards, profiles, reports, users } from '@db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  QUEUE_MAX_PAGE_SIZE,
  QUEUE_PAGE_SIZE,
  reportIdParamSchema,
  type ReportReason,
  type ReportStatus,
  type UserRole,
} from '@/shared/validation/moderation';
import { handleParamSchema, type PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** Reporting is cheap to abuse (a flood buries real reports), so it is limited per reporter. Every limit fails closed. */
export const RATE = {
  report: rule(10, 86_400),
  read: rule(120, 60),
  act: rule(120, 3600),
} as const;

/**
 * File a report against a user ("Flag trouble"). Repeating a report while one is still open is a harmless no-op (one
 * open report per reporter/target), so the caller cannot tell whether it was new, and cannot flood the queue.
 */
export async function createReport(
  reporterId: string,
  targetUserId: string,
  reason: ReportReason,
  details?: string,
  /** A snapshot of the words being reported (a Post Card), kept so the evidence outlives the card. */
  evidenceText?: string,
  /** The card itself, when the report is about one — lets a moderator act on it directly. */
  cardId?: string,
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
      cardId: cardId ?? null,
    })
    .onConflictDoNothing();
}

// ─── the moderator gate ──────────────────────────────────────────────────────────────────────────────────────────────

/** Does this role reach the queue? `admin` is reserved for capabilities not built yet — both pass the same gate today. */
export function isModeratorRole(role: string): boolean {
  return role === 'moderator' || role === 'admin';
}

async function roleOf(userId: string): Promise<UserRole | null> {
  const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return (row?.role as UserRole) ?? null;
}

/** For the app shell: should this person see the Moderation nav item at all? Best-effort, never throws. */
export async function isModerator(userId: string): Promise<boolean> {
  const role = await roleOf(userId);
  return role !== null && isModeratorRole(role);
}

async function requireModerator(userId: string): Promise<void> {
  const role = await roleOf(userId);
  if (!role || !isModeratorRole(role)) throw new AppError('FORBIDDEN');
}

// ─── the audit trail ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ModerationAuditEvent =
  'report_dismissed' | 'card_removed' | 'account_suspended' | 'account_reinstated';

/** Append to the shared security audit trail (`audit_log`). `moderatorId` is the actor; everything else is `meta`. */
async function auditModAction(
  event: ModerationAuditEvent,
  moderatorId: string,
  meta: Record<string, string>,
): Promise<void> {
  await getDb().insert(auditLog).values({ event, userId: moderatorId, meta });
}

// ─── people, the moderator's own way (unlike `profiles.getCards`, inactive/suspended accounts are NOT hidden) ────────

export interface ModPersonRef {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  status: 'active' | 'suspended' | 'pending_deletion';
}

async function modCards(userIds: string[]): Promise<Map<string, ModPersonRef>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      userId: users.id,
      handle: users.handle,
      displayName: profiles.displayName,
      portraitTint: profiles.portraitTint,
      status: users.status,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(sql`${users.id} = any(${ids})`);
  return new Map(
    rows.map((r) => [
      r.userId,
      {
        handle: r.handle,
        displayName: r.displayName,
        portraitTint: r.portraitTint as PortraitTint,
        status: r.status as ModPersonRef['status'],
      },
    ]),
  );
}

// ─── the queue ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface QueueItem {
  id: string;
  reason: ReportReason;
  details: string | null;
  evidenceText: string | null;
  /** True when the reported Post Card still exists and can be removed directly from here. */
  canRemoveCard: boolean;
  status: ReportStatus;
  createdAt: Date;
  /** Null when the reporter's account is since gone — the report itself is kept regardless. */
  reporter: ModPersonRef | null;
  /** Null when the target's account is since gone. */
  target: ModPersonRef | null;
  reviewedBy: ModPersonRef | null;
  reviewedAt: Date | null;
}

export interface QueuePage {
  reports: QueueItem[];
  nextCursor: string | null;
}

interface Row {
  id: string;
  reporterId: string | null;
  targetUserId: string | null;
  reason: string;
  details: string | null;
  evidenceText: string | null;
  cardId: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

/** One page of the queue, newest first, optionally filtered to one status (defaults to `open`). Moderator only. */
export async function listQueue(
  moderatorId: string,
  opts: { status?: ReportStatus | undefined; cursor?: string | undefined; limit?: number | undefined },
): Promise<QueuePage> {
  await requireModerator(moderatorId);
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`moderation:read:${moderatorId}`, RATE.read);
  const limit = Math.min(Math.max(opts.limit ?? QUEUE_PAGE_SIZE, 1), QUEUE_MAX_PAGE_SIZE);
  const status = opts.status ?? 'open';

  const rows: Row[] = await getDb()
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.status, status),
        cursor ? sql`(${reports.createdAt}, ${reports.id}) < (${cursor.at}, ${cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);

  const peopleIds = page.flatMap((r) =>
    [r.reporterId, r.targetUserId, r.reviewedBy].filter((x) => x !== null),
  );
  const cardIds = page.flatMap((r) => (r.cardId ? [r.cardId] : []));
  const [people, liveCards] = await Promise.all([
    modCards(peopleIds),
    cardIds.length
      ? getDb()
          .select({ id: postCards.id })
          .from(postCards)
          .where(sql`${postCards.id} = any(${cardIds})`)
      : Promise.resolve([]),
  ]);
  const liveCardIds = new Set(liveCards.map((c) => c.id));

  const last = page.at(-1);
  return {
    reports: page.map((r) => ({
      id: r.id,
      reason: r.reason as ReportReason,
      details: r.details,
      evidenceText: r.evidenceText,
      canRemoveCard: r.cardId !== null && liveCardIds.has(r.cardId),
      status: r.status as ReportStatus,
      createdAt: r.createdAt,
      reporter: r.reporterId ? (people.get(r.reporterId) ?? null) : null,
      target: r.targetUserId ? (people.get(r.targetUserId) ?? null) : null,
      reviewedBy: r.reviewedBy ? (people.get(r.reviewedBy) ?? null) : null,
      reviewedAt: r.reviewedAt,
    })),
    nextCursor: more && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

async function loadReport(reportId: string): Promise<Row | null> {
  if (!reportIdParamSchema.safeParse(reportId).success) return null;
  const [row] = await getDb().select().from(reports).where(eq(reports.id, reportId)).limit(1);
  return row ?? null;
}

/** Close a report without acting on it — it looked fine, or nothing more can be done. */
export async function dismissReport(moderatorId: string, reportId: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const row = await loadReport(reportId);
  if (!row) throw new AppError('NOT_FOUND');
  await getDb()
    .update(reports)
    .set({ status: 'dismissed', reviewedBy: moderatorId, reviewedAt: new Date() })
    .where(eq(reports.id, reportId));
  await auditModAction('report_dismissed', moderatorId, { reportId });
}

/** Take down the Post Card a report is about, and close the report. The card's replies and Yos go with it (cascade). */
export async function removeReportedCard(moderatorId: string, reportId: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const row = await loadReport(reportId);
  if (!row) throw new AppError('NOT_FOUND');
  if (!row.cardId) throw new AppError('BAD_REQUEST', { message: 'This report is not about a Post Card.' });
  await getDb().transaction(async (tx) => {
    await tx.delete(postCards).where(eq(postCards.id, row.cardId!));
    await tx
      .update(reports)
      .set({ status: 'actioned', reviewedBy: moderatorId, reviewedAt: new Date() })
      .where(eq(reports.id, reportId));
  });
  await auditModAction('card_removed', moderatorId, { reportId, cardId: row.cardId });
}

/** Suspend the account a report is about, and close the report as actioned. */
export async function suspendFromReport(moderatorId: string, reportId: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const row = await loadReport(reportId);
  if (!row) throw new AppError('NOT_FOUND');
  if (!row.targetUserId) {
    throw new AppError('BAD_REQUEST', { message: 'The reported account no longer exists.' });
  }
  await getDb().transaction(async (tx) => {
    await tx.update(users).set({ status: 'suspended' }).where(eq(users.id, row.targetUserId!));
    await tx
      .update(reports)
      .set({ status: 'actioned', reviewedBy: moderatorId, reviewedAt: new Date() })
      .where(eq(reports.id, reportId));
  });
  await auditModAction('account_suspended', moderatorId, { reportId, targetUserId: row.targetUserId });
}

// ─── acting on an account directly (no report involved) ────────────────────────────────────────────────────────────

/**
 * Find someone by call sign the way a moderator needs to — unlike `profiles.resolveHandle`, an inactive or
 * suspended account is not hidden (a moderator must be able to look up who they are about to reinstate).
 */
async function findByHandle(handle: string): Promise<{ userId: string; status: string } | null> {
  const parsed = handleParamSchema.safeParse(handle);
  if (!parsed.success) return null;
  const [row] = await getDb()
    .select({ userId: users.id, status: users.status })
    .from(users)
    .where(eq(users.handle, parsed.data))
    .limit(1);
  return row ?? null;
}

/** Suspend an account by call sign, independent of any report. Idempotent: suspending an already-suspended account is a no-op. */
export async function suspendAccount(moderatorId: string, targetHandle: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const target = await findByHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  if (target.userId === moderatorId) {
    throw new AppError('BAD_REQUEST', { message: 'You cannot suspend yourself.' });
  }
  const rows = await getDb()
    .update(users)
    .set({ status: 'suspended' })
    .where(and(eq(users.id, target.userId), eq(users.status, 'active')))
    .returning({ id: users.id });
  if (rows.length > 0)
    await auditModAction('account_suspended', moderatorId, { targetUserId: target.userId });
}

/** Lift a suspension. Idempotent: reinstating an account that is not suspended is a no-op. */
export async function reinstateAccount(moderatorId: string, targetHandle: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const target = await findByHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  const rows = await getDb()
    .update(users)
    .set({ status: 'active' })
    .where(and(eq(users.id, target.userId), eq(users.status, 'suspended')))
    .returning({ id: users.id });
  if (rows.length > 0)
    await auditModAction('account_reinstated', moderatorId, { targetUserId: target.userId });
}

/** One account's current standing, for the moderator's own lookup-by-handle tool. */
export async function findAccountForModeration(
  moderatorId: string,
  handle: string,
): Promise<(ModPersonRef & { userId: string }) | null> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:read:${moderatorId}`, RATE.read);
  const target = await findByHandle(handle);
  if (!target) return null;
  const card = (await modCards([target.userId])).get(target.userId);
  return card ? { ...card, userId: target.userId } : null;
}
