import { tributes } from '@db/schema';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { can, type Actor, type RanchResource } from '@/modules/authz';
import { getCards, getFenceResource, resolveHandle, type PersonCard } from '@/modules/profiles';
import { fenceStanding, hiddenAuthors } from '@/modules/relationships';
import { decodeCursor, encodeCursor, type Cursor } from '@/platform/cursor';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { TRIBUTE_MAX_PAGE_SIZE, TRIBUTE_PAGE_SIZE, tributeIdParamSchema } from '@/shared/validation/tributes';
import type { PortraitTint } from '@/shared/validation/profile';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });

/** Every limit fails closed. Reads have the same headroom as the Fence; giving one is the rarer, weightier action. */
export const RATE = {
  readUser: rule(240, 60),
  readAnonymous: rule(60, 60),
  give: rule(20, 3600),
  givePerOwner: rule(3, 3600),
  manage: rule(120, 3600),
} as const;

/** A Tribute nobody has approved or declined for this long is dropped (see docs/DATA_LIFECYCLE.md). */
export const PENDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ROUNDS = 4;
const QUEUE_LIMIT = 50;

export interface AuthorRef {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
}

export interface TributeView {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRef;
  mine: boolean;
  /** Only ever true for the writer of a Tribute that is honestly waiting for the owner's approval. */
  waiting: boolean;
  pinned: boolean;
  canRemove: boolean;
}

export interface TributePage {
  tributes: TributeView[];
  nextCursor: string | null;
  isOwner: boolean;
  /** May the viewer leave a Tribute here right now (Posse gate)? */
  canGive: boolean;
}

const toRef = (p: PersonCard): AuthorRef => ({
  handle: p.handle,
  displayName: p.displayName,
  portraitTint: p.portraitTint,
});

const actorOf = (userId: string): Actor => ({ kind: 'user', id: userId, status: 'active' });

/** Load the Ranch and the viewer's standing on it, or null when they may not read it (hidden ≡ missing). */
async function access(
  viewer: Actor,
  ownerId: string,
): Promise<{ ranch: RanchResource; relationship: Awaited<ReturnType<typeof fenceStanding>> } | null> {
  // Both at once (one round trip, not two): the standing needs only the owner's id.
  const [ranch, relationship] = await Promise.all([
    getFenceResource(ownerId),
    viewer.kind === 'user'
      ? fenceStanding(ownerId, viewer.id)
      : Promise.resolve({ relationship: 'UNKNOWN' as const, restricted: false }),
  ]);
  if (!ranch) return null;
  return can(viewer, 'profile:view', ranch, { relationship: relationship.relationship }).allow
    ? { ranch, relationship }
    : null;
}

interface Row {
  id: string;
  ownerId: string;
  authorId: string;
  body: string;
  status: string;
  pinned: boolean;
  createdAt: Date;
}

async function hydrate(
  viewerId: string | null,
  rows: Row[],
  authors: Map<string, PersonCard>,
): Promise<TributeView[]> {
  return rows.flatMap((row) => {
    const author = authors.get(row.authorId);
    if (!author) return [];
    return [
      {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: toRef(author),
        mine: row.authorId === viewerId,
        waiting: row.authorId === viewerId && row.status === 'pending',
        pinned: row.pinned,
        canRemove: viewerId !== null && (row.authorId === viewerId || row.ownerId === viewerId),
      },
    ];
  });
}

/**
 * One page of a Ranch's Tributes, newest first (the pinned one, when there is one, always leads — see below), or null
 * when the viewer may not read this Ranch at all (missing, inactive and hidden are the same). The page holds published
 * Tributes plus the viewer's own waiting one. People the viewer muted or is in a block with are left out, and so are
 * people whose account is no longer active.
 */
export async function listTributes(
  viewer: Actor,
  handle: string,
  opts: { rateKey: string; cursor?: string | undefined; limit?: number | undefined },
): Promise<TributePage | null> {
  let cursor: Cursor | null = null;
  if (opts.cursor !== undefined) {
    cursor = decodeCursor(opts.cursor);
    if (!cursor) throw new AppError('BAD_REQUEST', { message: 'That page marker is not valid.' });
  }
  await enforceRateLimit(
    `tributes:read:${opts.rateKey}`,
    viewer.kind === 'user' ? RATE.readUser : RATE.readAnonymous,
  );

  const owner = await resolveHandle(handle);
  if (!owner) return null;
  const ownerId = owner.userId;
  const acc = await access(viewer, ownerId);
  if (!acc) return null;
  const viewerId = viewer.kind === 'user' ? viewer.id : null;
  const limit = Math.min(Math.max(opts.limit ?? TRIBUTE_PAGE_SIZE, 1), TRIBUTE_MAX_PAGE_SIZE);

  const kept: Row[] = [];
  const keptAuthors = new Map<string, PersonCard>();
  let next: Cursor | null = null;
  let position = cursor;

  for (let round = 0; round < MAX_ROUNDS && kept.length < limit; round++) {
    const rows: Row[] = await getDb()
      .select()
      .from(tributes)
      .where(
        and(
          eq(tributes.ownerId, ownerId),
          viewerId
            ? sql`(${tributes.status} = 'published' or ${tributes.authorId} = ${viewerId})`
            : eq(tributes.status, 'published'),
          position
            ? sql`(${tributes.createdAt}, ${tributes.id}) < (${position.at}, ${position.id})`
            : undefined,
        ),
      )
      .orderBy(desc(tributes.pinned), desc(tributes.createdAt), desc(tributes.id))
      .limit(limit + 1);
    const more = rows.length > limit;
    const page = rows.slice(0, limit);
    const authors = await getCards(page.map((r) => r.authorId));
    const hidden = viewerId
      ? await hiddenAuthors(
          viewerId,
          page.map((r) => r.authorId),
        )
      : new Set<string>();

    let last: Row | undefined;
    let consumed = 0;
    for (const row of page) {
      last = row;
      consumed++;
      const author = authors.get(row.authorId);
      if (author && !hidden.has(row.authorId)) {
        kept.push(row);
        keptAuthors.set(row.authorId, author);
        if (kept.length === limit) break;
      }
    }
    const rest = page.length - consumed > 0 || more;
    position = last ? { at: last.createdAt, id: last.id } : position;
    if (!rest) {
      next = null;
      break;
    }
    next = position;
  }

  return {
    tributes: await hydrate(viewerId, kept, keptAuthors),
    nextCursor: next ? encodeCursor(next) : null,
    isOwner: viewerId === ownerId,
    canGive: can(viewer, 'tribute:give', acc.ranch, { relationship: acc.relationship.relationship }).allow,
  };
}

/** Leave a Tribute on the Ranch of the person with call sign `handle`. Always waits for the owner's approval. */
export async function giveTribute(authorId: string, handle: string, body: string): Promise<TributeView> {
  // Spent before the handle is looked up: the same limit trips whether the Ranch exists, is hidden or is made up.
  await enforceRateLimit(`tributes:give:${authorId}`, RATE.give);
  const owner = await resolveHandle(handle);
  if (!owner) throw new AppError('NOT_FOUND');
  const ownerId = owner.userId;
  const actor = actorOf(authorId);
  const acc = await access(actor, ownerId);
  if (!acc) throw new AppError('NOT_FOUND');
  if (!can(actor, 'tribute:give', acc.ranch, { relationship: acc.relationship.relationship }).allow) {
    throw new AppError('FORBIDDEN', { message: 'Only your Pals can leave you a Tribute.' });
  }
  await enforceRateLimit(`tributes:give:${authorId}:${ownerId}`, RATE.givePerOwner);
  const [row] = await getDb()
    .insert(tributes)
    .values({ ownerId, authorId, body, status: 'pending', createdAt: new Date() })
    .returning();
  emit({ type: 'tribute.given', tributeId: row!.id, ownerId, authorId });
  const authors = await getCards([authorId]);
  const [view] = await hydrate(authorId, [row!], authors);
  if (!view) throw new AppError('INTERNAL');
  return view;
}

/** Everything an owner action on one Tribute needs, or null when it is not theirs (kept apart from the read path on purpose). */
async function loadOwned(ownerId: string, tributeId: string): Promise<Row | null> {
  if (!tributeIdParamSchema.safeParse(tributeId).success) return null;
  const [row] = await getDb()
    .select()
    .from(tributes)
    .where(and(eq(tributes.id, tributeId), eq(tributes.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/** Let a waiting Tribute through. Owner only. Approval bumps its clock so readers already past that spot still see it. */
export async function approveTribute(ownerId: string, tributeId: string): Promise<void> {
  await enforceRateLimit(`tributes:manage:${ownerId}`, RATE.manage);
  const row = await loadOwned(ownerId, tributeId);
  if (!row) throw new AppError('NOT_FOUND');
  if (row.status === 'published') return;
  await getDb()
    .update(tributes)
    .set({ status: 'published', createdAt: new Date() })
    .where(eq(tributes.id, tributeId));
  emit({ type: 'tribute.approved', tributeId, ownerId, authorId: row.authorId });
}

/**
 * Pin or unpin a published Tribute. Only one may be pinned at a time: pinning this one silently unpins whichever was
 * pinned before (both changes happen in one transaction). Unpinning only ever clears THIS Tribute — it is a no-op if
 * something else is the pinned one.
 */
export async function setTributePinned(ownerId: string, tributeId: string, pinned: boolean): Promise<void> {
  await enforceRateLimit(`tributes:manage:${ownerId}`, RATE.manage);
  const row = await loadOwned(ownerId, tributeId);
  if (!row || (pinned && row.status !== 'published')) throw new AppError('NOT_FOUND');
  if (!pinned) {
    await getDb().update(tributes).set({ pinned: false }).where(eq(tributes.id, tributeId));
    return;
  }
  await getDb().transaction(async (tx) => {
    await tx
      .update(tributes)
      .set({ pinned: false })
      .where(and(eq(tributes.ownerId, ownerId), eq(tributes.pinned, true)));
    await tx.update(tributes).set({ pinned: true }).where(eq(tributes.id, tributeId));
  });
}

/**
 * Take a Tribute down. The author can always remove their own (even after being blocked, and while it is still
 * waiting — that is how you decline having asked); the owner can remove anything on their own Ranch (accepted or not);
 * nobody else can, and nobody else can tell whether it exists.
 */
export async function removeTribute(userId: string, tributeId: string): Promise<void> {
  await enforceRateLimit(`tributes:manage:${userId}`, RATE.manage);
  if (!tributeIdParamSchema.safeParse(tributeId).success) throw new AppError('NOT_FOUND');
  const [row] = await getDb().select().from(tributes).where(eq(tributes.id, tributeId)).limit(1);
  if (!row || (row.authorId !== userId && row.ownerId !== userId)) throw new AppError('NOT_FOUND');
  await getDb().delete(tributes).where(eq(tributes.id, tributeId));
}

export interface WaitingTribute {
  id: string;
  body: string;
  createdAt: Date;
  author: AuthorRef;
}

/** What is waiting for the owner's approval. People the owner blocked or muted, and inactive accounts, are left out. */
export async function listWaitingTributes(ownerId: string): Promise<WaitingTribute[]> {
  await enforceRateLimit(`tributes:manage:${ownerId}`, RATE.manage);
  const rows = await getDb()
    .select()
    .from(tributes)
    .where(and(eq(tributes.ownerId, ownerId), eq(tributes.status, 'pending')))
    .orderBy(desc(tributes.createdAt), desc(tributes.id))
    .limit(QUEUE_LIMIT);
  const ids = rows.map((r) => r.authorId);
  const [authors, hidden] = await Promise.all([getCards(ids), hiddenAuthors(ownerId, ids)]);
  return rows
    .filter((r) => authors.has(r.authorId) && !hidden.has(r.authorId))
    .map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: toRef(authors.get(r.authorId)!),
    }));
}

/** Retention: drop waiting Tributes nobody answered for 30 days. Returns how many rows were removed. */
export async function purgeStaleTributes(now: Date = new Date()): Promise<{ tributes: number }> {
  const cutoff = new Date(now.getTime() - PENDING_RETENTION_MS);
  const rows = await getDb()
    .delete(tributes)
    .where(and(eq(tributes.status, 'pending'), lt(tributes.createdAt, cutoff)))
    .returning({ id: tributes.id });
  return { tributes: rows.length };
}
