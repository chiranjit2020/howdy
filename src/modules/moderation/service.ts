import {
  auditLog,
  media,
  messages,
  postCards,
  profiles,
  reports,
  sessions,
  suspensions,
  townHalls,
  users,
} from '@db/schema';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { isUnderReview } from './anti-spam';
import { AppError } from '@/platform/errors';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  QUEUE_MAX_PAGE_SIZE,
  QUEUE_PAGE_SIZE,
  reportIdParamSchema,
  SUSPENSION_DAYS,
  type AppealDecision,
  type ReportReason,
  type ReportStatus,
  type ReportSubject,
  type SuspensionLength,
  type UserRole,
} from '@/shared/validation/moderation';
import { handleParamSchema, type PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** Reporting is cheap to abuse (a flood buries real reports), so it is limited per reporter. Every limit fails closed. */
export const RATE = {
  report: rule(10, 86_400),
  read: rule(120, 60),
  act: rule(120, 3600),
  /** A suspended person sending their appeal (one per suspension anyway; this only stops hammering). */
  appeal: rule(5, 3600),
} as const;

/**
 * What a report is about, beyond the person (ADR-025). The caller has already checked the reporter may see it. The
 * words are a snapshot, kept so the evidence outlives the thing itself.
 */
export type ReportAbout =
  | { subject: 'card'; cardId: string; evidence: string }
  | { subject: 'portrait'; mediaId: string }
  | { subject: 'whisper'; messageId: string; evidence: string }
  | { subject: 'town_hall'; townHallId: string; evidence: string };

const EVIDENCE_MAX = 600;

/**
 * File a report against a user ("Flag trouble"), optionally about one thing of theirs. Repeating a report while one is
 * still open is a harmless no-op (one open report per reporter, target and kind of thing), so the caller cannot tell
 * whether it was new, and cannot flood the queue.
 */
export async function createReport(
  reporterId: string,
  targetUserId: string,
  input: { reason: ReportReason; details?: string | undefined; about?: ReportAbout },
): Promise<void> {
  if (reporterId === targetUserId)
    throw new AppError('BAD_REQUEST', { message: 'You cannot report yourself.' });
  await enforceRateLimit(`report:${reporterId}`, RATE.report);
  const about = input.about;
  const evidence = about && 'evidence' in about && about.evidence.length > 0 ? about.evidence : null;
  await getDb()
    .insert(reports)
    .values({
      reporterId,
      targetUserId,
      reason: input.reason,
      subject: about?.subject ?? 'person',
      details: input.details && input.details.length > 0 ? input.details : null,
      evidenceText: evidence ? evidence.slice(0, EVIDENCE_MAX) : null,
      cardId: about?.subject === 'card' ? about.cardId : null,
      mediaId: about?.subject === 'portrait' ? about.mediaId : null,
      messageId: about?.subject === 'whisper' ? about.messageId : null,
      townHallId: about?.subject === 'town_hall' ? about.townHallId : null,
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

/** Everyone else gets the same plain 404 as a page that does not exist: the moderation area is not advertised. */
async function requireModerator(userId: string): Promise<void> {
  const role = await roleOf(userId);
  if (!role || !isModeratorRole(role)) throw new AppError('NOT_FOUND');
}

// ─── the audit trail ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ModerationAuditEvent =
  | 'report_dismissed'
  | 'card_removed'
  | 'account_suspended'
  | 'account_reinstated'
  | 'appeal_granted'
  | 'appeal_upheld'
  | 'whisper_removed'
  | 'town_hall_removed'
  | 'portrait_removed';

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
    .where(inArray(users.id, ids));
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
  /** What the report is about: the person, or one thing of theirs (ADR-025). */
  subject: ReportSubject;
  details: string | null;
  evidenceText: string | null;
  /** True when the reported thing (card, photo, Whisper, Town Hall) still exists and can be removed from here. */
  canRemove: boolean;
  /** `canRemove` for a Post Card (kept for the card flow's callers). */
  canRemoveCard: boolean;
  status: ReportStatus;
  createdAt: Date;
  /** Null when the reporter's account is since gone — the report itself is kept regardless. */
  reporter: ModPersonRef | null;
  /** Null when the target's account is since gone. */
  target: ModPersonRef | null;
  /** Enough people have reported the target lately that what they write on other Fences is being held (ADR-024). */
  targetHeld: boolean;
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
  subject: string;
  details: string | null;
  evidenceText: string | null;
  cardId: string | null;
  mediaId: string | null;
  messageId: string | null;
  townHallId: string | null;
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
  const [people, live] = await Promise.all([modCards(peopleIds), stillThere(page)]);
  const targets = [...new Set(page.flatMap((r) => (r.targetUserId ? [r.targetUserId] : [])))];
  const held = new Set(
    (await Promise.all(targets.map(async (t) => ((await isUnderReview(t)) ? t : null)))).filter(
      (t) => t !== null,
    ),
  );

  const last = page.at(-1);
  return {
    reports: page.map((r) => ({
      id: r.id,
      reason: r.reason as ReportReason,
      details: r.details,
      subject: r.subject as ReportSubject,
      evidenceText: r.evidenceText,
      canRemove: live.has(r.id),
      canRemoveCard: r.subject === 'card' && live.has(r.id),
      status: r.status as ReportStatus,
      createdAt: r.createdAt,
      reporter: r.reporterId ? (people.get(r.reporterId) ?? null) : null,
      target: r.targetUserId ? (people.get(r.targetUserId) ?? null) : null,
      targetHeld: r.targetUserId !== null && held.has(r.targetUserId),
      reviewedBy: r.reviewedBy ? (people.get(r.reviewedBy) ?? null) : null,
      reviewedAt: r.reviewedAt,
    })),
    nextCursor: more && last ? encodeCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/**
 * Which of these reports are about a thing that still exists (so a moderator can still remove it)? A card, Whisper or
 * Town Hall that is gone, or a Portrait that has since been replaced or removed, is not. One query per kind.
 */
async function stillThere(rows: Row[]): Promise<Set<string>> {
  const ids = (key: 'cardId' | 'messageId' | 'townHallId' | 'mediaId') =>
    rows.flatMap((r) => (r[key] ? [r[key]] : []));
  const db = getDb();
  const [cards, msgs, halls, photos] = await Promise.all([
    ids('cardId').length
      ? db
          .select({ id: postCards.id })
          .from(postCards)
          .where(inArray(postCards.id, ids('cardId')))
      : [],
    ids('messageId').length
      ? db
          .select({ id: messages.id })
          .from(messages)
          .where(inArray(messages.id, ids('messageId')))
      : [],
    ids('townHallId').length
      ? db
          .select({ id: townHalls.id })
          .from(townHalls)
          .where(inArray(townHalls.id, ids('townHallId')))
      : [],
    ids('mediaId').length
      ? db
          .select({ id: media.id })
          .from(media)
          .where(and(inArray(media.id, ids('mediaId')), eq(media.status, 'ready')))
      : [],
  ]);
  const alive = new Set([...cards, ...msgs, ...halls, ...photos].map((x) => x.id));
  const pointer = (r: Row) =>
    ({ card: r.cardId, whisper: r.messageId, town_hall: r.townHallId, portrait: r.mediaId, person: null })[
      r.subject as ReportSubject
    ] ?? null;
  return new Set(
    rows.flatMap((r) => {
      const p = pointer(r);
      return p && alive.has(p) ? [r.id] : [];
    }),
  );
}

async function loadReport(reportId: string): Promise<Row | null> {
  if (!reportIdParamSchema.safeParse(reportId).success) return null;
  const [row] = await getDb().select().from(reports).where(eq(reports.id, reportId)).limit(1);
  return row ?? null;
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** The report a moderator is about to act on. Whether it is still open is decided atomically by `closeReport`. */
async function reportToActOn(moderatorId: string, reportId: string): Promise<Row> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const row = await loadReport(reportId);
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}

/**
 * Close the report inside the action's own transaction, before anything else in it. The WHERE requires it to be still
 * open, so a closed report answers 409 and of two moderators acting at once exactly one wins; the loser's whole
 * transaction (card removal, suspension) rolls back.
 */
async function closeReport(
  tx: Tx,
  moderatorId: string,
  reportId: string,
  status: 'actioned' | 'dismissed',
): Promise<void> {
  const rows = await tx
    .update(reports)
    .set({ status, reviewedBy: moderatorId, reviewedAt: new Date() })
    .where(and(eq(reports.id, reportId), sql`${reports.status} in ('open', 'reviewing')`))
    .returning({ id: reports.id });
  if (rows.length === 0) throw new AppError('CONFLICT', { message: 'This report was already closed.' });
}

/**
 * Suspend an account and end every session it holds. Sessions already stop working for a suspended account, but revoking
 * them too means lifting the suspension later does not quietly bring an old (maybe stolen) device back. Staff accounts
 * (the acting moderator included) are never suspended from here — one moderator must not be able to lock out the
 * others; that is done by hand. Only an `active` account changes (a pending deletion stays one). Returns whether
 * anything changed.
 */
interface SuspendWith {
  moderatorId: string;
  reason: ReportReason;
  length: SuspensionLength;
  reportId?: string;
}

function endsAtFor(length: SuspensionLength, from = new Date()): Date | null {
  const days = SUSPENSION_DAYS[length];
  return days === null ? null : new Date(from.getTime() + days * 86_400_000);
}

async function suspendInTx(tx: Tx, targetUserId: string, how: SuspendWith): Promise<boolean> {
  const [target] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (target && isModeratorRole(target.role)) {
    throw new AppError('BAD_REQUEST', { message: 'Staff accounts cannot be suspended from here.' });
  }
  const changed = await tx
    .update(users)
    .set({ status: 'suspended' })
    .where(and(eq(users.id, targetUserId), eq(users.status, 'active')))
    .returning({ id: users.id });
  // The account was active a moment ago, so it has no live suspension: this is its only one (unique index).
  if (changed.length > 0) {
    await tx.insert(suspensions).values({
      userId: targetUserId,
      reason: how.reason,
      endsAt: endsAtFor(how.length),
      createdBy: how.moderatorId,
      reportId: how.reportId ?? null,
    });
  }
  await tx
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, targetUserId), isNull(sessions.revokedAt)));
  return changed.length > 0;
}

/** Close a report without acting on it — it looked fine, or nothing more can be done. */
export async function dismissReport(moderatorId: string, reportId: string): Promise<void> {
  await reportToActOn(moderatorId, reportId);
  await getDb().transaction((tx) => closeReport(tx, moderatorId, reportId, 'dismissed'));
  await auditModAction('report_dismissed', moderatorId, { reportId });
}

/** Take down the Post Card a report is about, and close the report. The card's replies and Yos go with it (cascade). */
export async function removeReportedCard(moderatorId: string, reportId: string): Promise<void> {
  const row = await reportToActOn(moderatorId, reportId);
  const cardId = row.cardId;
  if (!cardId) throw new AppError('BAD_REQUEST', { message: 'This report is not about a Post Card.' });
  await getDb().transaction(async (tx) => {
    await closeReport(tx, moderatorId, reportId, 'actioned');
    await tx.delete(postCards).where(eq(postCards.id, cardId));
  });
  await auditModAction('card_removed', moderatorId, { reportId, cardId });
}

/** The report must be about this kind of thing, and still point at it; otherwise 400 with a plain reason. */
function pointerFor(row: Row, subject: 'whisper' | 'town_hall' | 'portrait'): string {
  const id = { whisper: row.messageId, town_hall: row.townHallId, portrait: row.mediaId }[subject];
  const what = { whisper: 'a Whisper', town_hall: 'a Town Hall', portrait: 'a photo' }[subject];
  if (row.subject !== subject)
    throw new AppError('BAD_REQUEST', { message: `This report is not about ${what}.` });
  if (!id) throw new AppError('BAD_REQUEST', { message: `That ${what.slice(2)} is already gone.` });
  return id;
}

/**
 * Take down the one Whisper a report is about (from both sides of the thread), and close the report. The rest of the
 * thread is never read or touched here.
 */
export async function removeReportedWhisper(moderatorId: string, reportId: string): Promise<void> {
  const row = await reportToActOn(moderatorId, reportId);
  const messageId = pointerFor(row, 'whisper');
  await getDb().transaction(async (tx) => {
    await closeReport(tx, moderatorId, reportId, 'actioned');
    await tx.delete(messages).where(eq(messages.id, messageId));
  });
  await auditModAction('whisper_removed', moderatorId, { reportId, messageId });
}

/** Take down the Town Hall a report is about (its memberships and invites go with it), and close the report. */
export async function removeReportedTownHall(moderatorId: string, reportId: string): Promise<void> {
  const row = await reportToActOn(moderatorId, reportId);
  const townHallId = pointerFor(row, 'town_hall');
  await getDb().transaction(async (tx) => {
    await closeReport(tx, moderatorId, reportId, 'actioned');
    await tx.delete(townHalls).where(eq(townHalls.id, townHallId));
  });
  await auditModAction('town_hall_removed', moderatorId, { reportId, townHallId });
}

/**
 * Take down the exact Portrait a report is about, and close the report. The file lives in object storage, which only
 * the media module may touch, so the caller passes `retire` (the app layer wires in `media.retirePortrait`). It runs
 * inside the report's transaction: if removing the photo fails, the report stays open. A photo that has since been
 * replaced is not the one reported and is left alone (`retire` answers false → 409, nothing closes).
 */
export async function removeReportedPortrait(
  moderatorId: string,
  reportId: string,
  retire: (ownerId: string, mediaId: string) => Promise<boolean>,
): Promise<void> {
  const row = await reportToActOn(moderatorId, reportId);
  const mediaId = pointerFor(row, 'portrait');
  const ownerId = row.targetUserId;
  if (!ownerId) throw new AppError('BAD_REQUEST', { message: 'The reported account no longer exists.' });
  await getDb().transaction(async (tx) => {
    await closeReport(tx, moderatorId, reportId, 'actioned');
    if (!(await retire(ownerId, mediaId))) {
      throw new AppError('CONFLICT', { message: 'That photo has already been changed or removed.' });
    }
  });
  await auditModAction('portrait_removed', moderatorId, { reportId, mediaId });
}

/**
 * For showing a moderator the reported photo: whose it is and which version. Null unless the report is about a
 * Portrait. Whether that exact file still exists is the caller's check (it compares the version it reads).
 */
export async function reportedPortrait(
  moderatorId: string,
  reportId: string,
): Promise<{ ownerId: string; mediaId: string } | null> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:read:${moderatorId}`, RATE.read);
  const row = await loadReport(reportId);
  if (!row || row.subject !== 'portrait' || !row.mediaId || !row.targetUserId) return null;
  return { ownerId: row.targetUserId, mediaId: row.mediaId };
}

/**
 * Suspend the account a report is about, and close the report as actioned. The reason shown to them defaults to the
 * report's own.
 */
export async function suspendFromReport(
  moderatorId: string,
  reportId: string,
  opts: { length: SuspensionLength; reason?: ReportReason | undefined },
): Promise<void> {
  const row = await reportToActOn(moderatorId, reportId);
  const targetUserId = row.targetUserId;
  if (!targetUserId) {
    throw new AppError('BAD_REQUEST', { message: 'The reported account no longer exists.' });
  }
  await getDb().transaction(async (tx) => {
    await closeReport(tx, moderatorId, reportId, 'actioned');
    await suspendInTx(tx, targetUserId, {
      moderatorId,
      reason: opts.reason ?? (row.reason as ReportReason),
      length: opts.length,
      reportId,
    });
  });
  await auditModAction('account_suspended', moderatorId, { reportId, targetUserId });
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
export async function suspendAccount(
  moderatorId: string,
  targetHandle: string,
  opts: { length: SuspensionLength; reason: ReportReason },
): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const target = await findByHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  const changed = await getDb().transaction((tx) =>
    suspendInTx(tx, target.userId, { moderatorId, reason: opts.reason, length: opts.length }),
  );
  if (changed) await auditModAction('account_suspended', moderatorId, { targetUserId: target.userId });
}

/** Lift a suspension. Idempotent: reinstating an account that is not suspended is a no-op. */
export async function reinstateAccount(moderatorId: string, targetHandle: string): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  const target = await findByHandle(targetHandle);
  if (!target) throw new AppError('NOT_FOUND');
  const changed = await getDb().transaction((tx) =>
    liftInTx(tx, target.userId, { cause: 'reinstated', by: moderatorId }),
  );
  if (changed) await auditModAction('account_reinstated', moderatorId, { targetUserId: target.userId });
}

/**
 * Make a suspended account active again and close its live suspension. An open appeal on it counts as granted (it got
 * what it asked for). Only a `suspended` account changes. Returns whether anything changed.
 */
async function liftInTx(
  tx: Tx,
  userId: string,
  how: { cause: 'reinstated' | 'expired' | 'appeal'; by: string | null },
): Promise<boolean> {
  const rows = await tx
    .update(users)
    .set({ status: 'active' })
    .where(and(eq(users.id, userId), eq(users.status, 'suspended')))
    .returning({ id: users.id });
  if (rows.length === 0) return false;
  const now = new Date();
  const [live] = await tx
    .update(suspensions)
    .set({ liftedAt: now, liftedBy: how.by, liftCause: how.cause })
    .where(and(eq(suspensions.userId, userId), isNull(suspensions.liftedAt)))
    .returning({ id: suspensions.id, appealStatus: suspensions.appealStatus });
  if (live?.appealStatus === 'open') {
    await tx
      .update(suspensions)
      .set({ appealStatus: 'granted', appealReviewedBy: how.by, appealReviewedAt: now })
      .where(eq(suspensions.id, live.id));
  }
  return true;
}

export interface ModAccount extends ModPersonRef {
  /** The live suspension, when there is one. */
  suspension: { reason: ReportReason; endsAt: Date | null; since: Date } | null;
}

/** One account's current standing, for the moderator's own lookup-by-handle tool. */
export async function findAccountForModeration(
  moderatorId: string,
  handle: string,
): Promise<ModAccount | null> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:read:${moderatorId}`, RATE.read);
  const target = await findByHandle(handle);
  if (!target) return null;
  const card = (await modCards([target.userId])).get(target.userId);
  if (!card) return null;
  const live = await liveSuspension(target.userId);
  return {
    ...card,
    suspension: live
      ? { reason: live.reason as ReportReason, endsAt: live.endsAt, since: live.createdAt }
      : null,
  };
}

async function liveSuspension(userId: string) {
  const [row] = await getDb()
    .select()
    .from(suspensions)
    .where(and(eq(suspensions.userId, userId), isNull(suspensions.liftedAt)))
    .limit(1);
  return row ?? null;
}

// ─── appeals, the moderator's side ───────────────────────────────────────────────────────────────────────────────────

export interface AppealItem {
  /** The suspension's id: an appeal lives on the suspension it is about. */
  id: string;
  person: ModPersonRef | null;
  reason: ReportReason;
  suspendedAt: Date;
  endsAt: Date | null;
  suspendedBy: ModPersonRef | null;
  text: string;
  appealedAt: Date;
}

export interface AppealsPage {
  appeals: AppealItem[];
  nextCursor: string | null;
}

/** Open appeals, oldest first (they have waited longest). Moderator only. */
export async function listAppeals(
  moderatorId: string,
  opts: { cursor?: string | undefined },
): Promise<AppealsPage> {
  await requireModerator(moderatorId);
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(`moderation:read:${moderatorId}`, RATE.read);
  const limit = QUEUE_PAGE_SIZE;
  const rows = await getDb()
    .select()
    .from(suspensions)
    .where(
      and(
        eq(suspensions.appealStatus, 'open'),
        isNull(suspensions.liftedAt),
        cursor
          ? sql`(${suspensions.appealedAt}, ${suspensions.id}) > (${cursor.at}, ${cursor.id})`
          : undefined,
      ),
    )
    .orderBy(asc(suspensions.appealedAt), asc(suspensions.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const people = await modCards(page.flatMap((r) => (r.createdBy ? [r.userId, r.createdBy] : [r.userId])));
  const last = page.at(-1);
  return {
    appeals: page.map((r) => ({
      id: r.id,
      person: people.get(r.userId) ?? null,
      reason: r.reason as ReportReason,
      suspendedAt: r.createdAt,
      endsAt: r.endsAt,
      suspendedBy: r.createdBy ? (people.get(r.createdBy) ?? null) : null,
      text: r.appealText ?? '',
      appealedAt: r.appealedAt ?? r.createdAt,
    })),
    nextCursor: more && last?.appealedAt ? encodeCursor({ at: last.appealedAt, id: last.id }) : null,
  };
}

/**
 * Answer an appeal: `grant` lifts the suspension, `uphold` lets it stand (the person is told at their next sign-in).
 * Answered exactly once: the update requires the appeal to be still open, so a second answer or a racing moderator gets
 * 409 and changes nothing.
 */
export async function decideAppeal(
  moderatorId: string,
  suspensionId: string,
  decision: AppealDecision,
): Promise<void> {
  await requireModerator(moderatorId);
  await enforceRateLimit(`moderation:act:${moderatorId}`, RATE.act);
  if (!reportIdParamSchema.safeParse(suspensionId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb()
    .select({ userId: suspensions.userId })
    .from(suspensions)
    .where(eq(suspensions.id, suspensionId))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  const userId = row.userId;
  await getDb().transaction(async (tx) => {
    const claimed = await tx
      .update(suspensions)
      .set({
        appealStatus: decision === 'grant' ? 'granted' : 'upheld',
        appealReviewedBy: moderatorId,
        appealReviewedAt: new Date(),
      })
      .where(
        and(
          eq(suspensions.id, suspensionId),
          eq(suspensions.appealStatus, 'open'),
          isNull(suspensions.liftedAt),
        ),
      )
      .returning({ id: suspensions.id });
    if (claimed.length === 0)
      throw new AppError('CONFLICT', { message: 'This appeal was already answered.' });
    if (decision === 'grant') await liftInTx(tx, userId, { cause: 'appeal', by: moderatorId });
  });
  await auditModAction(decision === 'grant' ? 'appeal_granted' : 'appeal_upheld', moderatorId, {
    suspensionId,
    targetUserId: userId,
  });
}

// ─── the suspended person's side (sign-in calls these, before any session exists) ──────────────────────────────────

export interface SuspensionNotice {
  reason: ReportReason;
  /** Null: until a moderator lifts it. */
  endsAt: Date | null;
  /** available: they may still appeal. open: waiting for an answer. upheld: answered, and the suspension stands. */
  appeal: 'available' | 'open' | 'upheld';
}

const auditExpired = (userId: string) =>
  getDb().insert(auditLog).values({ event: 'suspension_expired', userId, meta: {} });

/**
 * What sign-in says to someone whose account is suspended. A timed suspension that has run out is lifted here, and the
 * caller carries on signing them in. Reveals why the account is suspended, so it is only for callers that have ALREADY
 * verified the password.
 */
export async function suspensionAtSignIn(
  userId: string,
): Promise<{ lifted: true } | { lifted: false; notice: SuspensionNotice }> {
  const live = await liveSuspension(userId);
  // Suspended by hand in the database with no row: nothing more specific than the generic reason to say.
  if (!live) return { lifted: false, notice: { reason: 'other', endsAt: null, appeal: 'available' } };
  if (live.endsAt && live.endsAt.getTime() <= Date.now()) {
    const lifted = await getDb().transaction((tx) => liftInTx(tx, userId, { cause: 'expired', by: null }));
    if (lifted) await auditExpired(userId);
    return { lifted: true };
  }
  const appeal =
    live.appealStatus === 'open' ? 'open' : live.appealStatus === 'upheld' ? 'upheld' : 'available';
  return { lifted: false, notice: { reason: live.reason as ReportReason, endsAt: live.endsAt, appeal } };
}

/**
 * File the one appeal a suspension allows. Only for callers that have ALREADY verified the password. A suspension set
 * by hand (no row) gets one here, so the appeal has somewhere to live.
 */
export async function fileAppeal(userId: string, text: string): Promise<void> {
  await enforceRateLimit(`moderation:appeal:${userId}`, RATE.appeal);
  const [user] = await getDb()
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user?.status !== 'suspended') {
    throw new AppError('BAD_REQUEST', { message: 'This account is not suspended.' });
  }
  await getDb().transaction(async (tx) => {
    await tx.insert(suspensions).values({ userId, reason: 'other' }).onConflictDoNothing();
    const rows = await tx
      .update(suspensions)
      .set({ appealText: text, appealedAt: new Date(), appealStatus: 'open' })
      .where(
        and(eq(suspensions.userId, userId), isNull(suspensions.liftedAt), isNull(suspensions.appealText)),
      )
      .returning({ id: suspensions.id });
    if (rows.length === 0) {
      throw new AppError('CONFLICT', { message: 'You have already appealed this suspension.' });
    }
  });
}

/** Closed reports (their words, and who reported whom) are kept this long after a moderator closed them. */
export const CLOSED_REPORT_RETENTION_DAYS = 365;

/**
 * Retention (decided 2026-09-30, in the Privacy Policy): delete reports a moderator closed more than a year ago — the
 * evidence snapshot, the details and the reporter/target link all go with the row. Open reports are never touched,
 * however old. A suspension that came from a report keeps its own reason (its `report_id` just clears). The audit
 * trail keeps only ids of what happened.
 */
export async function purgeClosedReports(now: Date = new Date()): Promise<{ reportsPurged: number }> {
  const cutoff = new Date(now.getTime() - CLOSED_REPORT_RETENTION_DAYS * 86_400_000);
  const gone = await getDb()
    .delete(reports)
    .where(and(inArray(reports.status, ['actioned', 'dismissed']), lte(reports.reviewedAt, cutoff)))
    .returning({ id: reports.id });
  return { reportsPurged: gone.length };
}

/** Daily upkeep: lift every timed suspension whose time has run out, so the person reappears without signing in. */
export async function liftExpiredSuspensions(): Promise<{ suspensionsLifted: number }> {
  const due = await getDb()
    .select({ userId: suspensions.userId })
    .from(suspensions)
    .where(and(isNull(suspensions.liftedAt), lte(suspensions.endsAt, new Date())))
    .limit(1000);
  let lifted = 0;
  for (const { userId } of due) {
    if (await getDb().transaction((tx) => liftInTx(tx, userId, { cause: 'expired', by: null }))) {
      lifted += 1;
      await auditExpired(userId);
    }
  }
  return { suspensionsLifted: lifted };
}
