import { posseLinks, scouts, userControls } from '@db/schema';
import { and, count, desc, eq, inArray, or } from 'drizzle-orm';
import { can } from '@/modules/authz';
import { enforceNewAccountLimit } from '@/modules/moderation';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { RelationshipState } from '@/shared/relationship';
import type { RelationshipAction } from '@/shared/validation/relationships';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** All limits fail closed. Asking to join a Posse is the harassment-prone action, so it has the tightest budget. */
export const RATE = {
  act: rule(120, 3600),
  request: rule(20, 86_400),
} as const;
export const MAX_PENDING_OUTGOING = 50;
/** After a request is declined, the same person cannot ask again for this long (they are never told it was declined). */
export const DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export const LIST_LIMIT = 100;

/** A relationship from one person's point of view. Never reveals the other side's private choices. */
export interface RelationshipView {
  /** none | sent (I asked; pending — or silently declined) | received (they asked me) | member (mutual Posse). */
  posse: 'none' | 'sent' | 'received' | 'member';
  /** I privately marked them a Close Posse member. Their marking of me is never exposed. */
  closeByMe: boolean;
  scouting: boolean;
  muted: boolean;
  restricted: boolean;
  blocked: boolean;
}

type Control = 'block' | 'mute' | 'restrict';

/** uuid strings compare like Postgres' bytewise uuid ordering, so this matches the `user_low < user_high` check. */
function order(a: string, b: string): { low: string; high: string; aIsLow: boolean } {
  return a < b ? { low: a, high: b, aIsLow: true } : { low: b, high: a, aIsLow: false };
}

const pairWhere = (a: string, b: string) => {
  const { low, high } = order(a, b);
  return and(eq(posseLinks.userLow, low), eq(posseLinks.userHigh, high));
};

/**
 * How `ownerId` regards `viewerId`, as one state for the authorisation policy. BLOCKED means EITHER side blocked the
 * other (a block hides both ways). Precedence: BLOCKED > CLOSE_POSSE > POSSE > RESTRICTED > MUTED > REQUESTED > SCOUTING >
 * PASSERBY. A muted or restricted Posse member is still POSSE: those controls limit interaction, not who may look.
 */
export async function relationshipOf(ownerId: string, viewerId: string): Promise<RelationshipState> {
  if (ownerId === viewerId) return 'UNKNOWN'; // the policy short-circuits owners; there is no relationship with yourself
  const db = getDb();
  const [controls, [link], [scouting]] = await Promise.all([
    db
      .select({ actorId: userControls.actorId, kind: userControls.kind })
      .from(userControls)
      .where(
        or(
          and(eq(userControls.actorId, ownerId), eq(userControls.targetId, viewerId)),
          and(
            eq(userControls.actorId, viewerId),
            eq(userControls.targetId, ownerId),
            eq(userControls.kind, 'block'),
          ),
        ),
      ),
    db.select().from(posseLinks).where(pairWhere(ownerId, viewerId)).limit(1),
    db
      .select({ s: scouts.scoutId })
      .from(scouts)
      .where(and(eq(scouts.scoutId, viewerId), eq(scouts.scouteeId, ownerId)))
      .limit(1),
  ]);

  if (controls.some((c) => c.kind === 'block')) return 'BLOCKED';
  if (link?.status === 'accepted') {
    const ownerIsLow = order(ownerId, viewerId).aIsLow;
    const ownerMarksClose = ownerIsLow ? link.lowMarksClose : link.highMarksClose;
    return ownerMarksClose ? 'CLOSE_POSSE' : 'POSSE';
  }
  if (controls.some((c) => c.actorId === ownerId && c.kind === 'restrict')) return 'RESTRICTED';
  if (controls.some((c) => c.actorId === ownerId && c.kind === 'mute')) return 'MUTED';
  if (link?.status === 'requested') return 'REQUESTED';
  if (scouting) return 'SCOUTING';
  return 'PASSERBY';
}

/**
 * `fenceStanding(ownerId, actorId)` for many owners at once, in three queries whatever their number (Phase 13). Built
 * from the same rules as `relationshipOf` + the restrict check, in the same order of precedence, so every answer is
 * identical to the single version (tests/security/batch-equivalence.test.ts compares them pair by pair).
 */
export async function fenceStandings(
  ownerIds: string[],
  actorId: string,
): Promise<Map<string, { relationship: RelationshipState; restricted: boolean }>> {
  const out = new Map<string, { relationship: RelationshipState; restricted: boolean }>();
  const ids = [...new Set(ownerIds)];
  for (const id of ids) if (id === actorId) out.set(id, { relationship: 'UNKNOWN', restricted: false });
  const others = ids.filter((id) => id !== actorId);
  if (others.length === 0) return out;
  const db = getDb();
  const [controls, links, scouting] = await Promise.all([
    db
      .select({ actorId: userControls.actorId, targetId: userControls.targetId, kind: userControls.kind })
      .from(userControls)
      .where(
        or(
          // what each owner set on the actor…
          and(inArray(userControls.actorId, others), eq(userControls.targetId, actorId)),
          // …and any block the actor set on an owner
          and(
            eq(userControls.actorId, actorId),
            inArray(userControls.targetId, others),
            eq(userControls.kind, 'block'),
          ),
        ),
      ),
    db
      .select()
      .from(posseLinks)
      .where(
        or(
          and(eq(posseLinks.userLow, actorId), inArray(posseLinks.userHigh, others)),
          and(eq(posseLinks.userHigh, actorId), inArray(posseLinks.userLow, others)),
        ),
      ),
    db
      .select({ scouteeId: scouts.scouteeId })
      .from(scouts)
      .where(and(eq(scouts.scoutId, actorId), inArray(scouts.scouteeId, others))),
  ]);
  const scouted = new Set(scouting.map((s) => s.scouteeId));
  for (const ownerId of others) {
    const mine = controls.filter(
      (c) =>
        (c.actorId === ownerId && c.targetId === actorId) ||
        (c.actorId === actorId && c.targetId === ownerId),
    );
    const link = links.find(
      (l) =>
        (l.userLow === ownerId && l.userHigh === actorId) ||
        (l.userHigh === ownerId && l.userLow === actorId),
    );
    const ownerSet = (kind: string) => mine.some((c) => c.actorId === ownerId && c.kind === kind);
    let relationship: RelationshipState;
    if (mine.some((c) => c.kind === 'block')) relationship = 'BLOCKED';
    else if (link?.status === 'accepted') {
      const ownerMarksClose = order(ownerId, actorId).aIsLow ? link.lowMarksClose : link.highMarksClose;
      relationship = ownerMarksClose ? 'CLOSE_POSSE' : 'POSSE';
    } else if (ownerSet('restrict')) relationship = 'RESTRICTED';
    else if (ownerSet('mute')) relationship = 'MUTED';
    else if (link?.status === 'requested') relationship = 'REQUESTED';
    else if (scouted.has(ownerId)) relationship = 'SCOUTING';
    else relationship = 'PASSERBY';
    out.set(ownerId, { relationship, restricted: ownerSet('restrict') });
  }
  return out;
}

/**
 * What the Fence policy needs to know about `actorId` as seen by the Fence owner `ownerId`: the state for the policy plus
 * whether the owner has restricted them (a restricted Posse member is still POSSE, so it cannot ride on the state).
 */
export async function fenceStanding(
  ownerId: string,
  actorId: string,
): Promise<{ relationship: RelationshipState; restricted: boolean }> {
  if (ownerId === actorId) return { relationship: 'UNKNOWN', restricted: false };
  const [relationship, [row]] = await Promise.all([
    relationshipOf(ownerId, actorId),
    getDb()
      .select({ k: userControls.kind })
      .from(userControls)
      .where(
        and(
          eq(userControls.actorId, ownerId),
          eq(userControls.targetId, actorId),
          eq(userControls.kind, 'restrict'),
        ),
      )
      .limit(1),
  ]);
  return { relationship, restricted: Boolean(row) };
}

/**
 * Has `ownerId` blocked or restricted `actorId`? Only the owner's own choices count (a block the actor set is not one).
 * For a server-side decision that must never be shown to the actor (ADR-038: such a person's Burn Thread only clears it
 * for themselves).
 */
export async function hasLimited(ownerId: string, actorId: string): Promise<boolean> {
  if (ownerId === actorId) return false;
  const [row] = await getDb()
    .select({ k: userControls.kind })
    .from(userControls)
    .where(
      and(
        eq(userControls.actorId, ownerId),
        eq(userControls.targetId, actorId),
        inArray(userControls.kind, ['block', 'restrict']),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** `hasLimited` for many actors at once: which of `actorIds` has `ownerId` blocked or restricted? One query. */
export async function limitedAmong(ownerId: string, actorIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(actorIds)].filter((id) => id !== ownerId);
  if (ids.length === 0) return new Set();
  const rows = await getDb()
    .select({ targetId: userControls.targetId })
    .from(userControls)
    .where(
      and(
        eq(userControls.actorId, ownerId),
        inArray(userControls.targetId, ids),
        inArray(userControls.kind, ['block', 'restrict']),
      ),
    );
  return new Set(rows.map((r) => r.targetId));
}

/**
 * Of `otherIds`, who is `userId` currently in each other's Posse with AND not in a block with (either direction)? Those are the
 * people a Whisper thread is still open with. Two queries for the whole list.
 */
export async function posseMembersAmong(userId: string, otherIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(otherIds)].filter((id) => id !== userId);
  if (ids.length === 0) return new Set();
  const db = getDb();
  const [links, blocks] = await Promise.all([
    db
      .select({ low: posseLinks.userLow, high: posseLinks.userHigh })
      .from(posseLinks)
      .where(
        and(
          eq(posseLinks.status, 'accepted'),
          or(
            and(eq(posseLinks.userLow, userId), inArray(posseLinks.userHigh, ids)),
            and(eq(posseLinks.userHigh, userId), inArray(posseLinks.userLow, ids)),
          ),
        ),
      ),
    db
      .select({ actorId: userControls.actorId, targetId: userControls.targetId })
      .from(userControls)
      .where(
        and(
          eq(userControls.kind, 'block'),
          or(
            and(eq(userControls.actorId, userId), inArray(userControls.targetId, ids)),
            and(eq(userControls.targetId, userId), inArray(userControls.actorId, ids)),
          ),
        ),
      ),
  ]);
  const blocked = new Set(blocks.map((b) => (b.actorId === userId ? b.targetId : b.actorId)));
  return new Set(links.map((l) => (l.low === userId ? l.high : l.low)).filter((id) => !blocked.has(id)));
}

/**
 * Which of `authorIds` must `viewerId` NOT see the words of? Anyone in a block with the viewer (either direction) and
 * anyone the viewer muted. One query for the whole page. Mute and block are private to the viewer, so the result is only
 * ever used to leave things out — never reported back.
 */
export async function hiddenAuthors(viewerId: string, authorIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(authorIds)].filter((id) => id !== viewerId);
  if (ids.length === 0) return new Set();
  const rows = await getDb()
    .select({ actorId: userControls.actorId, targetId: userControls.targetId, kind: userControls.kind })
    .from(userControls)
    .where(
      or(
        and(
          eq(userControls.actorId, viewerId),
          inArray(userControls.targetId, ids),
          inArray(userControls.kind, ['block', 'mute']),
        ),
        and(
          eq(userControls.targetId, viewerId),
          inArray(userControls.actorId, ids),
          eq(userControls.kind, 'block'),
        ),
      ),
    );
  return new Set(rows.map((r) => (r.actorId === viewerId ? r.targetId : r.actorId)));
}

/**
 * The Pals whose invitations to talk (a Porch Light, ADR-032) may reach `viewerId`: accepted Pals with no block either
 * way, who have NOT restricted the viewer, and whom the viewer has not muted. Restrict limits interaction, and a light is
 * nothing but an invitation, so a restricted Pal is left out (they cannot tell: a light for Close Pals looks the same).
 * For each, whether they privately marked the viewer as Close — only ever used to decide, never shown. `among` narrows
 * it to some people (one Porch); without it, all of the viewer's Pals. Two queries.
 */
export async function palsReaching(
  viewerId: string,
  among?: string[],
): Promise<Map<string, { marksMeClose: boolean }>> {
  const ids = among ? [...new Set(among)].filter((id) => id !== viewerId) : undefined;
  if (ids && ids.length === 0) return new Map();
  const db = getDb();
  const [links, controls] = await Promise.all([
    db
      .select({
        low: posseLinks.userLow,
        high: posseLinks.userHigh,
        lowClose: posseLinks.lowMarksClose,
        highClose: posseLinks.highMarksClose,
      })
      .from(posseLinks)
      .where(
        and(
          eq(posseLinks.status, 'accepted'),
          or(
            and(eq(posseLinks.userLow, viewerId), ids ? inArray(posseLinks.userHigh, ids) : undefined),
            and(eq(posseLinks.userHigh, viewerId), ids ? inArray(posseLinks.userLow, ids) : undefined),
          ),
        ),
      ),
    db
      .select({ actorId: userControls.actorId, targetId: userControls.targetId })
      .from(userControls)
      .where(
        or(
          and(
            eq(userControls.actorId, viewerId),
            inArray(userControls.kind, ['block', 'mute']),
            ids ? inArray(userControls.targetId, ids) : undefined,
          ),
          and(
            eq(userControls.targetId, viewerId),
            inArray(userControls.kind, ['block', 'restrict']),
            ids ? inArray(userControls.actorId, ids) : undefined,
          ),
        ),
      ),
  ]);
  const shut = new Set(controls.map((c) => (c.actorId === viewerId ? c.targetId : c.actorId)));
  const out = new Map<string, { marksMeClose: boolean }>();
  for (const l of links) {
    // The other side's own Close mark is the one that counts: their light, their Close Pals.
    const [other, marksMeClose] = l.low === viewerId ? [l.high, l.highClose] : [l.low, l.lowClose];
    if (!shut.has(other)) out.set(other, { marksMeClose });
  }
  return out;
}

interface Flags {
  view: RelationshipView;
  /** They blocked me. Never surfaced: callers treat the person as not found. */
  blockedByThem: boolean;
}

async function loadFlags(actorId: string, targetId: string): Promise<Flags> {
  const db = getDb();
  const [mine, theirs, [link], [scouting]] = await Promise.all([
    db
      .select({ kind: userControls.kind })
      .from(userControls)
      .where(and(eq(userControls.actorId, actorId), eq(userControls.targetId, targetId))),
    db
      .select({ kind: userControls.kind })
      .from(userControls)
      .where(
        and(
          eq(userControls.actorId, targetId),
          eq(userControls.targetId, actorId),
          eq(userControls.kind, 'block'),
        ),
      ),
    db.select().from(posseLinks).where(pairWhere(actorId, targetId)).limit(1),
    db
      .select({ s: scouts.scoutId })
      .from(scouts)
      .where(and(eq(scouts.scoutId, actorId), eq(scouts.scouteeId, targetId)))
      .limit(1),
  ]);
  const has = (k: Control) => mine.some((c) => c.kind === k);
  const actorIsLow = order(actorId, targetId).aIsLow;

  let posse: RelationshipView['posse'] = 'none';
  if (link?.status === 'accepted') posse = 'member';
  else if (link?.status === 'requested') posse = link.requestedBy === actorId ? 'sent' : 'received';
  else if (link?.status === 'declined' && link.requestedBy === actorId) posse = 'sent'; // a decline is never revealed

  return {
    blockedByThem: theirs.length > 0,
    view: {
      posse,
      closeByMe:
        link?.status === 'accepted' ? (actorIsLow ? link.lowMarksClose : link.highMarksClose) : false,
      scouting: Boolean(scouting),
      muted: has('mute'),
      restricted: has('restrict'),
      blocked: has('block'),
    },
  };
}

/** My relationship with `targetId`, or null when they blocked me (indistinguishable from "no such person"). */
export async function getRelationshipView(
  actorId: string,
  targetId: string,
): Promise<RelationshipView | null> {
  const { view, blockedByThem } = await loadFlags(actorId, targetId);
  return blockedByThem ? null : view;
}

/**
 * The budget for asking people to join a Posse: a daily limit on new asks, and a cap on how many can be waiting at once.
 * Callers spend it for every ask that could create a link — including asks that turn out to reach nobody (an unknown call
 * sign, a suspended account, a block, a cooldown) — so that hitting the limit looks identical whatever the target was.
 */
export async function spendRequestBudget(actorId: string): Promise<void> {
  await enforceRateLimit(`rel:request:${actorId}`, RATE.request);
  await enforceNewAccountLimit(actorId, 'palRequest');
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(posseLinks)
    .where(and(eq(posseLinks.requestedBy, actorId), eq(posseLinks.status, 'requested')));
  if (n >= MAX_PENDING_OUTGOING) {
    throw new AppError('RATE_LIMITED', {
      message: 'You have a lot of requests waiting. Give people a chance to answer first.',
      retryAfterSec: 3600,
    });
  }
}

/** Actions that reach out to someone. They are refused when either side has blocked the other. */
const INTERACTIVE: ReadonlySet<RelationshipAction> = new Set(['accept', 'close', 'scout']);

/**
 * Perform `action` on `targetId` as `actorId`. Ids are already resolved by the caller (handles → ids happens in the
 * profiles module, so this module never touches users/profiles). Every action is idempotent.
 */
export async function act(
  actorId: string,
  targetId: string,
  action: RelationshipAction,
): Promise<RelationshipView> {
  if (actorId === targetId) throw new AppError('BAD_REQUEST', { message: 'You cannot do that to yourself.' });
  await enforceRateLimit(`rel:act:${actorId}`, RATE.act);

  const relationship = await relationshipOf(targetId, actorId);
  const blocked = relationship === 'BLOCKED';
  const actor = { kind: 'user', id: actorId, status: 'active' } as const;
  const resource = { ownerId: targetId, ranchVisibility: 'members', signalVisibility: 'members' } as const;

  if (INTERACTIVE.has(action) && !can(actor, 'user:interact', resource, { relationship }).allow) {
    throw new AppError('NOT_FOUND');
  }

  const db = getDb();
  const now = new Date();
  const { low, high, aIsLow } = order(actorId, targetId);

  switch (action) {
    case 'request': {
      const [link] = await db.select().from(posseLinks).where(pairWhere(actorId, targetId)).limit(1);
      const iAlreadyAsked = link?.status === 'requested' && link.requestedBy === actorId;
      const theyAskedMe = link?.status === 'requested' && link.requestedBy === targetId;
      const alreadyMembers = link?.status === 'accepted';

      // EVERY request that is not a no-op the asker already knows about spends the same budget FIRST — whether the person
      // turns out to be blocked, has declined, or is a fresh ask. Otherwise a person at their limit would see "429" for an
      // ordinary target but "success" for one who blocked or declined them, and could tell the difference.
      if (!iAlreadyAsked && !theyAskedMe && !alreadyMembers) await spendRequestBudget(actorId);

      // A blocked person gets an ordinary-looking success and NOTHING is stored: a block must not be detectable.
      if (blocked) return { ...(await loadFlags(actorId, targetId)).view, posse: 'sent' };

      if (!link) {
        const made = await db
          .insert(posseLinks)
          .values({ userLow: low, userHigh: high, requestedBy: actorId })
          .onConflictDoNothing()
          .returning({ low: posseLinks.userLow });
        if (made.length > 0) emit({ type: 'posse.requested', actorId, targetId });
      } else if (theyAskedMe) {
        // They already asked me: asking back is agreeing. Mutual requests become a Posse.
        await db
          .update(posseLinks)
          .set({ status: 'accepted', respondedAt: now })
          .where(pairWhere(actorId, targetId));
        emit({ type: 'posse.accepted', actorId, targetId });
      } else if (link.status === 'declined') {
        const coolingDown =
          link.requestedBy === actorId &&
          link.respondedAt &&
          now.getTime() - link.respondedAt.getTime() < DECLINE_COOLDOWN_MS;
        // While cooling down the call "succeeds" and changes nothing — the requester is never told about the decline.
        if (!coolingDown) {
          await db
            .update(posseLinks)
            .set({ status: 'requested', requestedBy: actorId, respondedAt: null, createdAt: now })
            .where(pairWhere(actorId, targetId));
          emit({ type: 'posse.requested', actorId, targetId });
        }
      } // already requested by me, or already in the Posse: nothing to do
      break;
    }

    case 'accept':
    case 'decline': {
      const rows = await db
        .update(posseLinks)
        .set({ status: action === 'accept' ? 'accepted' : 'declined', respondedAt: now })
        .where(
          and(
            pairWhere(actorId, targetId),
            eq(posseLinks.status, 'requested'),
            eq(posseLinks.requestedBy, targetId),
          ),
        )
        .returning({ low: posseLinks.userLow });
      if (rows.length > 0 && action === 'accept') emit({ type: 'posse.accepted', actorId, targetId });
      if (rows.length === 0) {
        // Only the person who was asked can answer, and only a live request. Accepting twice (a double click, a retry)
        // is fine: if we are already in each other's Posse there is nothing more to do.
        const [now] = await db
          .select({ s: posseLinks.status })
          .from(posseLinks)
          .where(pairWhere(actorId, targetId))
          .limit(1);
        if (!(action === 'accept' && now?.s === 'accepted')) throw new AppError('NOT_FOUND');
      }
      break;
    }

    case 'cancel':
      // Only a still-pending request of mine. A declined one is left alone so the cooldown cannot be dodged.
      await db
        .delete(posseLinks)
        .where(
          and(
            pairWhere(actorId, targetId),
            eq(posseLinks.status, 'requested'),
            eq(posseLinks.requestedBy, actorId),
          ),
        );
      break;

    case 'leave':
      await db.delete(posseLinks).where(and(pairWhere(actorId, targetId), eq(posseLinks.status, 'accepted')));
      break;

    case 'close':
    case 'unclose': {
      const flag = aIsLow ? { lowMarksClose: action === 'close' } : { highMarksClose: action === 'close' };
      const rows = await db
        .update(posseLinks)
        .set(flag)
        .where(and(pairWhere(actorId, targetId), eq(posseLinks.status, 'accepted')))
        .returning({ low: posseLinks.userLow });
      if (rows.length === 0 && action === 'close') throw new AppError('NOT_FOUND'); // close needs an existing Posse
      break;
    }

    case 'scout':
      await db.insert(scouts).values({ scoutId: actorId, scouteeId: targetId }).onConflictDoNothing();
      break;
    case 'unscout':
      await db.delete(scouts).where(and(eq(scouts.scoutId, actorId), eq(scouts.scouteeId, targetId)));
      break;

    case 'mute':
    case 'restrict':
    case 'block': {
      if (action === 'block') {
        // One transaction: the block, and everything it ends (Posse, pending requests, scouting in both directions).
        await db.transaction(async (tx) => {
          await tx.insert(userControls).values({ actorId, targetId, kind: 'block' }).onConflictDoNothing();
          await tx.delete(posseLinks).where(pairWhere(actorId, targetId));
          await tx
            .delete(scouts)
            .where(
              or(
                and(eq(scouts.scoutId, actorId), eq(scouts.scouteeId, targetId)),
                and(eq(scouts.scoutId, targetId), eq(scouts.scouteeId, actorId)),
              ),
            );
        });
      } else {
        await db.insert(userControls).values({ actorId, targetId, kind: action }).onConflictDoNothing();
      }
      break;
    }

    case 'unmute':
    case 'unrestrict':
    case 'unblock': {
      const kind: Control = action === 'unmute' ? 'mute' : action === 'unrestrict' ? 'restrict' : 'block';
      await db
        .delete(userControls)
        .where(
          and(
            eq(userControls.actorId, actorId),
            eq(userControls.targetId, targetId),
            eq(userControls.kind, kind),
          ),
        );
      break;
    }
  }

  return (await loadFlags(actorId, targetId)).view;
}

export interface PersonRef {
  userId: string;
  at: Date;
}

export interface MyRelationships {
  posse: (PersonRef & { closeByMe: boolean })[];
  /** People who asked me. */
  incoming: PersonRef[];
  /** People I asked (a silently declined request still appears here, exactly as it does on their Ranch). */
  outgoing: PersonRef[];
  scouting: PersonRef[];
  blocked: PersonRef[];
  muted: PersonRef[];
  restricted: PersonRef[];
  /** True when any list was cut at LIST_LIMIT (paging arrives with the Fence). */
  truncated: boolean;
}

/** Everything about me, as user ids. Callers attach names (profiles) and drop inactive accounts. */
export async function listMyRelationships(actorId: string): Promise<MyRelationships> {
  const db = getDb();
  const limit = LIST_LIMIT + 1;
  const [links, scouting, controls] = await Promise.all([
    db
      .select()
      .from(posseLinks)
      .where(or(eq(posseLinks.userLow, actorId), eq(posseLinks.userHigh, actorId)))
      .orderBy(desc(posseLinks.createdAt))
      .limit(limit * 3),
    db.select().from(scouts).where(eq(scouts.scoutId, actorId)).orderBy(desc(scouts.createdAt)).limit(limit),
    db
      .select()
      .from(userControls)
      .where(eq(userControls.actorId, actorId))
      .orderBy(desc(userControls.createdAt))
      .limit(limit * 3),
  ]);

  const out: MyRelationships = {
    posse: [],
    incoming: [],
    outgoing: [],
    scouting: [],
    blocked: [],
    muted: [],
    restricted: [],
    truncated: false,
  };
  for (const l of links) {
    const iAmLow = l.userLow === actorId;
    const other = iAmLow ? l.userHigh : l.userLow;
    if (l.status === 'accepted') {
      out.posse.push({
        userId: other,
        at: l.respondedAt ?? l.createdAt,
        closeByMe: iAmLow ? l.lowMarksClose : l.highMarksClose,
      });
    } else if (l.status === 'requested' && l.requestedBy !== actorId) {
      out.incoming.push({ userId: other, at: l.createdAt });
    } else if (l.requestedBy === actorId) {
      out.outgoing.push({ userId: other, at: l.createdAt });
    }
  }
  for (const s of scouting) out.scouting.push({ userId: s.scouteeId, at: s.createdAt });
  for (const c of controls) {
    const bucket = c.kind === 'block' ? out.blocked : c.kind === 'mute' ? out.muted : out.restricted;
    bucket.push({ userId: c.targetId, at: c.createdAt });
  }

  for (const key of [
    'posse',
    'incoming',
    'outgoing',
    'scouting',
    'blocked',
    'muted',
    'restricted',
  ] as const) {
    if (out[key].length > LIST_LIMIT) {
      out.truncated = true;
      out[key] = out[key].slice(0, LIST_LIMIT) as never;
    }
  }
  return out;
}
