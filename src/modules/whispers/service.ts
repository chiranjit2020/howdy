import { conversations, messages } from '@db/schema';
import { and, asc, desc, eq, exists, inArray, lt, or, sql } from 'drizzle-orm';
import { can } from '@/modules/authz';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { bothShareReceipts, getCards, resolveHandle, type PersonCard } from '@/modules/profiles';
import { fenceStanding, hiddenAuthors, posseMembersAmong } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { WhisperMessage } from '@/shared/ws';
import {
  SYNC_BATCH,
  THREAD_MAX_PAGE_SIZE,
  THREAD_PAGE_SIZE,
  WHISPER_RETENTION_DAYS,
} from '@/shared/validation/whispers';
import { idParamSchema } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/**
 * Every limit fails closed. Per-person limits are spent BEFORE the person is looked up, so they behave identically whoever the
 * target is (a made-up call sign, a stranger, someone who blocked you). The per-thread limit is spent only AFTER access is
 * confirmed, for the same reason as on the Fence.
 */
export const RATE = {
  read: rule(240, 60),
  /** The source's "1 message per second", as a small burst allowance. */
  sendBurst: rule(3, 3),
  sendUser: rule(120, 3600),
  sendPerThread: rule(60, 3600),
  manage: rule(60, 3600),
} as const;

export const RETENTION_MS = WHISPER_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 100;
/** At most this many held Whispers in the tray (7 days of them; a flood is cut off, newest kept). */
const HELD_LIMIT = 200;
export const UNREAD_CAP = 99;

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** uuid strings compare like Postgres' bytewise uuid ordering, so this matches the `user_low < user_high` check. */
function order(a: string, b: string): { low: string; high: string; meIsLow: boolean } {
  return a < b ? { low: a, high: b, meIsLow: true } : { low: b, high: a, meIsLow: false };
}
const pairWhere = (a: string, b: string) => {
  const { low, high } = order(a, b);
  return and(eq(conversations.userLow, low), eq(conversations.userHigh, high));
};

interface MessageRow {
  id: string;
  seq: number;
  clientId: string;
  body: string;
  senderId: string;
  status: string;
  createdAt: Date;
}

const toWire = (m: MessageRow, userId: string): WhisperMessage => ({
  id: m.id,
  seq: m.seq,
  clientId: m.clientId,
  body: m.body,
  mine: m.senderId === userId,
  createdAt: m.createdAt.toISOString(),
});

/** Messages the person may see: everything sent to them or by them, but never words held back from them. */
const visibleTo = (userId: string) => or(eq(messages.status, 'sent'), eq(messages.senderId, userId));

/**
 * A Whisper as a report needs it (ADR-025): who sent it and its words. Only for its recipient — a participant of the
 * thread who did NOT send it — for a message that reached them, or one held back from them that they can read in their
 * held tray (ADR-026). It
 * deliberately does not require that they can still exchange Whispers: someone who blocked their harasser must still be
 * able to report what was said. Anything else is null, the same as a message that does not exist.
 */
export async function messageForReport(
  userId: string,
  messageId: string,
): Promise<{ id: string; senderId: string; body: string } | null> {
  await enforceRateLimit(`whisper:read:${userId}`, RATE.read);
  if (!idParamSchema.safeParse(messageId).success) return null;
  const [row] = await getDb()
    .select({ id: messages.id, senderId: messages.senderId, body: messages.body })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.id, messageId),
        inArray(messages.status, ['sent', 'held']),
        sql`${messages.senderId} <> ${userId}`,
        or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)),
      ),
    )
    .limit(1);
  return row ?? null;
}

interface Access {
  other: PersonCard;
  /** The other person has restricted me: my words are held for them (they look sent to me). */
  restricted: boolean;
}

/**
 * May `userId` exchange Whispers with the person called `handle` right now? Null covers a made-up call sign, an inactive
 * account, a stranger, a pending request and a block — all the same to the caller (hidden ≡ missing).
 */
async function access(userId: string, handle: string): Promise<Access | null> {
  const other = await resolveHandle(handle);
  if (!other || other.userId === userId) return null;
  const standing = await fenceStanding(other.userId, userId);
  const decision = can(
    { kind: 'user', id: userId, status: 'active' },
    'whisper:exchange',
    { ownerId: other.userId, ranchVisibility: 'members', signalVisibility: 'members' },
    { relationship: standing.relationship },
  );
  return decision.allow ? { other, restricted: standing.restricted } : null;
}

/**
 * May this person open the thread with `handle`? The thread page's gate, run in its layout before the loading outline
 * streams so a thread they may not open is a real 404. Reads nothing from the thread; its own rate-limit budget.
 */
export async function mayOpenThread(userId: string, handle: string): Promise<boolean> {
  await enforceRateLimit(`whisper:check:${userId}`, RATE.read);
  return (await access(userId, handle)) !== null;
}

// ─── sending ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Send a Whisper. Idempotent on `clientId`: a retry (a dropped connection, a double tap) returns the first message and does not
 * create a second or ring anything again. A restricted sender's message is stored as `held`: it looks sent to them and is
 * never shown to, or rung for, the recipient.
 */
export async function sendWhisper(
  userId: string,
  handle: string,
  clientId: string,
  body: string,
): Promise<{ message: WhisperMessage; created: boolean }> {
  await enforceRateLimit(`whisper:burst:${userId}`, RATE.sendBurst);
  await enforceRateLimit(`whisper:send:${userId}`, RATE.sendUser);
  await enforceNewAccountLimit(userId, 'whisper');
  const acc = await access(userId, handle);
  if (!acc) throw new AppError('NOT_FOUND');
  await enforceRateLimit(`whisper:thread:${userId}:${acc.other.userId}`, RATE.sendPerThread);

  const { low, high } = order(userId, acc.other.userId);
  const db = getDb();
  await db.insert(conversations).values({ userLow: low, userHigh: high }).onConflictDoNothing();

  const outcome = await db.transaction(async (tx: Tx) => {
    // Lock the thread: two messages sent at once get different numbers, in a definite order.
    const [conv] = await tx
      .select()
      .from(conversations)
      .where(pairWhere(userId, acc.other.userId))
      .for('update');
    if (!conv) throw new AppError('INTERNAL');
    const [again] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conv.id),
          eq(messages.senderId, userId),
          eq(messages.clientId, clientId),
        ),
      );
    if (again) return { conv, row: again, created: false };

    const seq = conv.lastSeq + 1;
    const now = new Date();
    const [row] = await tx
      .insert(messages)
      .values({
        conversationId: conv.id,
        senderId: userId,
        seq,
        clientId,
        body,
        status: acc.restricted ? 'held' : 'sent',
        createdAt: now,
      })
      .returning();
    // Writing into a thread means having seen it, so the sender's own read mark moves up to their message.
    await tx
      .update(conversations)
      .set({
        lastSeq: seq,
        lastMessageAt: now,
        ...(order(userId, acc.other.userId).meIsLow ? { lowReadSeq: seq } : { highReadSeq: seq }),
      })
      .where(eq(conversations.id, conv.id));
    return { conv, row: row!, created: true };
  });

  if (outcome.created) {
    emit({
      type: 'whisper.sent',
      conversationId: outcome.conv.id,
      seq: outcome.row.seq,
      senderId: userId,
      recipientId: acc.other.userId,
      held: outcome.row.status === 'held',
    });
  }
  return { message: toWire(outcome.row, userId), created: outcome.created };
}

// ─── reading a thread ────────────────────────────────────────────────────────────────────────────────────────────────

export interface ThreadPage {
  /** `portraitUrl` is filled in by the app layer only when the viewer may see it. */
  person: { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
  /** Oldest first. */
  messages: WhisperMessage[];
  /** More messages exist in the direction that was asked for. */
  hasMore: boolean;
  /**
   * "Seen": how far the other person has read, present only when both have read receipts on AND they have not restricted me.
   * A restricted sender therefore sees exactly what receipts-off looks like (their held words are never read, and the reader's
   * mark moves past them anyway when they reply).
   */
  seenUpTo?: number;
}

/**
 * A page of the thread with `handle`, or null when the person may not open it. Three ways to ask: the newest messages
 * (default), older ones (`before`), or what happened since a position (`after`, for catching up after a reconnect).
 */
export async function getThread(
  userId: string,
  handle: string,
  q: { before?: number | undefined; after?: number | undefined; limit?: number | undefined },
): Promise<ThreadPage | null> {
  await enforceRateLimit(`whisper:read:${userId}`, RATE.read);
  const acc = await access(userId, handle);
  if (!acc) return null;
  const person = {
    handle: acc.other.handle,
    displayName: acc.other.displayName,
    portraitTint: acc.other.portraitTint,
  };
  const db = getDb();
  const [[conv], shared] = await Promise.all([
    db.select().from(conversations).where(pairWhere(userId, acc.other.userId)),
    acc.restricted ? false : bothShareReceipts(userId, acc.other.userId),
  ]);
  // Present even before the first Whisper, so a page opened on an empty thread knows to watch for "Seen".
  const seen = shared
    ? { seenUpTo: !conv ? 0 : order(userId, acc.other.userId).meIsLow ? conv.highReadSeq : conv.lowReadSeq }
    : {};
  if (!conv) return { person, messages: [], hasMore: false, ...seen };

  const inThread = and(eq(messages.conversationId, conv.id), visibleTo(userId));
  if (q.after !== undefined) {
    const limit = Math.min(q.limit ?? SYNC_BATCH, THREAD_MAX_PAGE_SIZE);
    const rows = await db
      .select()
      .from(messages)
      .where(and(inThread, sql`${messages.seq} > ${q.after}`))
      .orderBy(asc(messages.seq))
      .limit(limit + 1);
    return {
      person,
      messages: rows.slice(0, limit).map((m) => toWire(m, userId)),
      hasMore: rows.length > limit,
      ...seen,
    };
  }
  const limit = Math.min(q.limit ?? THREAD_PAGE_SIZE, THREAD_MAX_PAGE_SIZE);
  const rows = await db
    .select()
    .from(messages)
    .where(q.before !== undefined ? and(inThread, lt(messages.seq, q.before)) : inThread)
    .orderBy(desc(messages.seq))
    .limit(limit + 1);
  return {
    person,
    messages: rows
      .slice(0, limit)
      .reverse()
      .map((m) => toWire(m, userId)),
    hasMore: rows.length > limit,
    ...seen,
  };
}

/**
 * Mark the thread read up to `upTo` (never beyond its last message). The other person learns it only as "Seen", and only when
 * both have read receipts on (see `ThreadPage.seenUpTo`).
 */
export async function markThreadRead(
  userId: string,
  handle: string,
  upTo: number,
): Promise<{ readUpTo: number }> {
  await enforceRateLimit(`whisper:manage:${userId}`, RATE.manage);
  const acc = await access(userId, handle);
  if (!acc) throw new AppError('NOT_FOUND');
  const { meIsLow } = order(userId, acc.other.userId);
  const col = meIsLow ? conversations.lowReadSeq : conversations.highReadSeq;
  const [row] = await getDb()
    .update(conversations)
    .set(
      meIsLow
        ? { lowReadSeq: sql`greatest(${conversations.lowReadSeq}, least(${upTo}, ${conversations.lastSeq}))` }
        : {
            highReadSeq: sql`greatest(${conversations.highReadSeq}, least(${upTo}, ${conversations.lastSeq}))`,
          },
    )
    .where(pairWhere(userId, acc.other.userId))
    .returning({ read: col });
  return { readUpTo: row?.read ?? 0 };
}

// ─── the list of threads ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ThreadSummary {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  /** Filled in by the app layer only when the viewer may see it. */
  portraitUrl?: string;
  last: { body: string; mine: boolean; at: string };
  unread: number;
  /** I have muted them: their Whispers arrive but do not ring or count in the badge. */
  muted: boolean;
}

/** Unread counts per thread (words from the other person, not held, past my read mark). */
async function unreadByThread(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: messages.conversationId, n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        inArray(messages.conversationId, conversationIds),
        sql`${messages.senderId} <> ${userId}`,
        eq(messages.status, 'sent'),
        sql`${messages.seq} > case when ${conversations.userLow} = ${userId} then ${conversations.lowReadSeq} else ${conversations.highReadSeq} end`,
      ),
    )
    .groupBy(messages.conversationId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** My threads, newest activity first — only with people I am still in a Posse with (and not blocked). */
export async function listThreads(userId: string): Promise<ThreadSummary[]> {
  await enforceRateLimit(`whisper:read:${userId}`, RATE.read);
  const db = getDb();
  const convs = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(LIST_LIMIT);
  if (convs.length === 0) return [];
  const otherOf = (c: { userLow: string; userHigh: string }) =>
    c.userLow === userId ? c.userHigh : c.userLow;
  const others = convs.map(otherOf);
  const ids = convs.map((c) => c.id);
  const [open, cards, hidden, unread, lasts] = await Promise.all([
    posseMembersAmong(userId, others),
    getCards(others),
    hiddenAuthors(userId, others),
    unreadByThread(userId, ids),
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        body: messages.body,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(and(inArray(messages.conversationId, ids), visibleTo(userId)))
      .orderBy(messages.conversationId, desc(messages.seq)),
  ]);
  const lastOf = new Map(lasts.map((l) => [l.conversationId, l]));
  return convs.flatMap((c) => {
    const other = otherOf(c);
    const card = cards.get(other);
    const last = lastOf.get(c.id);
    if (!open.has(other) || !card || !last) return [];
    return [
      {
        handle: card.handle,
        displayName: card.displayName,
        portraitTint: card.portraitTint,
        last: { body: last.body, mine: last.senderId === userId, at: last.createdAt.toISOString() },
        unread: unread.get(c.id) ?? 0,
        muted: hidden.has(other),
      },
    ];
  });
}

export interface HeldWhisper {
  id: string;
  body: string;
  createdAt: string;
  /** `portraitUrl` is filled in by the app layer only when the viewer may see it. */
  from: { handle: string; displayName: string; portraitTint: PortraitTint; portraitUrl?: string };
}

/**
 * The held tray (ADR-026): Whispers kept back from me because I restricted their sender, newest first. Only words sent
 * TO me. Reading them changes nothing — no read position, no "Seen", no event — so the sender cannot tell; to them the
 * Whispers still look delivered. Shown whether or not I still restrict them, or can still exchange Whispers with them
 * (after a block the tray is where the evidence is). Senders whose accounts are gone or suspended are left out, as in
 * every member-facing list. The 7-day retention empties it like any thread.
 */
export async function listHeld(userId: string): Promise<HeldWhisper[]> {
  await enforceRateLimit(`whisper:read:${userId}`, RATE.read);
  const rows = await getDb()
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
      senderId: messages.senderId,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        eq(messages.status, 'held'),
        sql`${messages.senderId} <> ${userId}`,
        or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(HELD_LIMIT);
  const cards = await getCards([...new Set(rows.map((r) => r.senderId))]);
  return rows.flatMap((r) => {
    const card = cards.get(r.senderId);
    if (!card) return [];
    return [
      {
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        from: { handle: card.handle, displayName: card.displayName, portraitTint: card.portraitTint },
      },
    ];
  });
}

/** How many Whispers are waiting in my held tray (for the link on the Whispers list; never a badge or a Chime). */
export async function countHeld(userId: string): Promise<number> {
  return (await listHeld(userId)).length;
}

/** How many threads have something new for me (muted people and closed threads do not count), capped at 99. */
export async function unreadThreads(userId: string): Promise<number> {
  const db = getDb();
  const convs = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.userLow, userId), eq(conversations.userHigh, userId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(LIST_LIMIT);
  if (convs.length === 0) return 0;
  const otherOf = (c: { userLow: string; userHigh: string }) =>
    c.userLow === userId ? c.userHigh : c.userLow;
  const others = convs.map(otherOf);
  const [open, hidden, unread, cards] = await Promise.all([
    posseMembersAmong(userId, others),
    hiddenAuthors(userId, others),
    unreadByThread(
      userId,
      convs.map((c) => c.id),
    ),
    getCards(others),
  ]);
  const n = convs.filter((c) => {
    const other = otherOf(c);
    return open.has(other) && cards.has(other) && !hidden.has(other) && (unread.get(c.id) ?? 0) > 0;
  }).length;
  return Math.min(n, UNREAD_CAP);
}

// ─── burning a thread ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * "Burn Thread": delete the whole thread for both people, at once and for good. Either person can, always (undoing or ending
 * a conversation is never gated by Posse or block). The answer is the same for a person who does not exist and a thread that
 * does not, so it reveals nothing.
 */
export async function burnThread(userId: string, handle: string): Promise<{ burned: number }> {
  await enforceRateLimit(`whisper:manage:${userId}`, RATE.manage);
  const other = await resolveHandle(handle);
  if (!other || other.userId === userId) return { burned: 0 };
  const rows = await getDb()
    .delete(conversations)
    .where(pairWhere(userId, other.userId))
    .returning({ id: conversations.id });
  return { burned: rows.length };
}

// ─── live delivery ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Should the WebSocket process push this message to `userId` right now? Called for EVERY delivery, so a person who was blocked (or
 * removed from the Posse, or whose words are held) after their connection opened stops receiving at once. Returns the message and
 * who it is with, or null.
 */
export async function messageForDelivery(
  userId: string,
  conversationId: string,
  seq: number,
): Promise<{ handle: string; message: WhisperMessage } | null> {
  const [row] = await getDb()
    .select({ m: messages, low: conversations.userLow, high: conversations.userHigh })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.conversationId, conversationId), eq(messages.seq, seq), visibleTo(userId)));
  if (!row || (row.low !== userId && row.high !== userId)) return null;
  const otherId = row.low === userId ? row.high : row.low;
  if (!(await posseMembersAmong(userId, [otherId])).has(otherId)) return null;
  const other = (await getCards([otherId])).get(otherId);
  return other ? { handle: other.handle, message: toWire(row.m, userId) } : null;
}

// ─── retention ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Retention: Whispers older than 7 days are deleted, and so are threads left with nothing in them. */
export async function purgeOldWhispers(
  now: Date = new Date(),
): Promise<{ messages: number; threads: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const db = getDb();
  const gone = await db.delete(messages).where(lt(messages.createdAt, cutoff)).returning({ id: messages.id });
  const empty = await db
    .delete(conversations)
    .where(
      and(
        lt(conversations.lastMessageAt, cutoff),
        sql`not ${exists(db.select({ x: messages.id }).from(messages).where(eq(messages.conversationId, conversations.id)))}`,
      ),
    )
    .returning({ id: conversations.id });
  return { messages: gone.length, threads: empty.length };
}
