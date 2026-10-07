import { profiles, users } from '@db/schema';
import { and, desc, eq, gt, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { can, type Actor, type FenceResource } from '@/modules/authz';
import { fenceStandings, relationshipOf } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { emit } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import {
  handleParamSchema,
  SIGNAL_TTL_MS,
  type FencePosting,
  type PortraitTint,
  type Visibility,
} from '@/shared/validation/profile';

type Db = ReturnType<typeof getDb>;

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/**
 * Scraping defence (master prompt §32): opening Ranches is rate limited per viewer (per address for anonymous callers).
 * Edits are limited per user. All limits fail closed if the limiter backend is down.
 */
export const RATE = {
  viewUser: rule(120, 60),
  viewAnonymous: rule(30, 60),
  edit: rule(20, 3600),
  signal: rule(30, 3600),
} as const;

/** What anyone allowed to see a Ranch receives. Never includes email, ids, status or privacy settings. */
export interface RanchView {
  handle: string;
  displayName: string;
  /** A short line about them, or null. */
  bio: string | null;
  portraitTint: PortraitTint;
  signal: { text: string; expiresAt: Date } | null;
  isOwner: boolean;
  /** The Howdy team account: shown with the Verified badge. */
  verified: boolean;
  /** Has earned the Trusted tick (the trust module, ADR-020). Never true for the team account, which has its own badge. */
  trusted: boolean;
}

/**
 * Has this person earned the Trusted tick? Read from the trust module's stored decision in the same query as the rest of
 * the person, so showing the tick costs nothing extra. The team account never shows it: Verified already says more.
 */
const earnedTick = sql<boolean>`exists (select 1 from trust_ticks t where t.user_id = ${users.id} and t.earned_at is not null)`;
const showsTick = (role: string, earned: boolean): boolean => earned && !isOfficial(role);

/**
 * The Howdy team account is any account with the `admin` role (set by hand in the database). Its Porch, Signal and
 * Fence are open to everyone, signed in or not, whatever its own settings say, so everyone can follow what is new in
 * Howdy; nobody can block it (see the relationships module); and it carries the Verified badge.
 */
export const isOfficial = (role: string): boolean => role === 'admin';

/** The privacy settings the policy should use: the account's own, or "everyone" for the Howdy team account. */
function effectiveVisibility(row: {
  role: string;
  ranchVisibility: string;
  signalVisibility: string;
  fenceVisibility?: string;
}): { ranchVisibility: Visibility; signalVisibility: Visibility; fenceVisibility: Visibility } {
  if (isOfficial(row.role)) {
    return { ranchVisibility: 'everyone', signalVisibility: 'everyone', fenceVisibility: 'everyone' };
  }
  return {
    ranchVisibility: row.ranchVisibility as Visibility,
    signalVisibility: row.signalVisibility as Visibility,
    fenceVisibility: (row.fenceVisibility ?? 'members') as Visibility,
  };
}

/** What the owner receives for their own Ranch (adds the privacy settings so they can be edited). */
export interface OwnRanch extends RanchView {
  ranchVisibility: Visibility;
  signalVisibility: Visibility;
  fenceVisibility: Visibility;
  fencePosting: FencePosting;
  fenceReview: boolean;
  shadowWalk: boolean;
  readReceipts: boolean;
  /** Story views, reciprocal (ADR-047). */
  storyViews: boolean;
  /** May I be suggested to Pals of my Pals ("Pals you may know", Phase 13)? */
  discoverable: boolean;
}

export interface RanchPatch {
  displayName?: string | undefined;
  /** Empty clears it. */
  bio?: string | undefined;
  portraitTint?: PortraitTint | undefined;
  ranchVisibility?: Visibility | undefined;
  signalVisibility?: Visibility | undefined;
  fenceVisibility?: Visibility | undefined;
  fencePosting?: FencePosting | undefined;
  fenceReview?: boolean | undefined;
  shadowWalk?: boolean | undefined;
  readReceipts?: boolean | undefined;
  storyViews?: boolean | undefined;
  discoverable?: boolean | undefined;
}

/** Create the Ranch for a new account. Called inside the sign-up transaction so every user always has one. */
export async function createProfile(
  db: Pick<Db, 'insert'>,
  userId: string,
  displayName: string,
): Promise<void> {
  await db.insert(profiles).values({ userId, displayName });
}

interface Row {
  userId: string;
  handle: string;
  role: string;
  displayName: string;
  bio: string | null;
  portraitTint: string;
  signal: string | null;
  signalExpiresAt: Date | null;
  ranchVisibility: string;
  signalVisibility: string;
  fenceVisibility: string;
  fencePosting: string;
  fenceReview: boolean;
  shadowWalk: boolean;
  readReceipts: boolean;
  storyViews: boolean;
  discoverable: boolean;
  earnedTick: boolean;
}

const SELECT = {
  userId: users.id,
  handle: users.handle,
  role: users.role,
  displayName: profiles.displayName,
  bio: profiles.bio,
  portraitTint: profiles.portraitTint,
  signal: profiles.signal,
  signalExpiresAt: profiles.signalExpiresAt,
  ranchVisibility: profiles.ranchVisibility,
  signalVisibility: profiles.signalVisibility,
  fenceVisibility: profiles.fenceVisibility,
  fencePosting: profiles.fencePosting,
  fenceReview: profiles.fenceReview,
  shadowWalk: profiles.shadowWalk,
  readReceipts: profiles.readReceipts,
  storyViews: profiles.storyViews,
  discoverable: profiles.discoverable,
  earnedTick,
} as const;

function toView(row: Row, isOwner: boolean, now: Date, showSignal: boolean): RanchView {
  const live = showSignal && row.signal !== null && row.signalExpiresAt !== null && row.signalExpiresAt > now;
  return {
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio,
    portraitTint: row.portraitTint as PortraitTint,
    // An expired Signal is gone even before the retention job clears it.
    signal: live ? { text: row.signal!, expiresAt: row.signalExpiresAt! } : null,
    isOwner,
    verified: isOfficial(row.role),
    trusted: showsTick(row.role, row.earnedTick),
  };
}

/**
 * Open a Ranch by handle as `viewer`. Returns null when the Ranch does not exist, its owner is not active, OR the
 * viewer is not allowed to see it — the three cases are deliberately indistinguishable to the caller.
 */
export async function getRanchForViewer(
  viewer: Actor,
  handleParam: string,
  opts: { rateKey: string; now?: Date },
): Promise<RanchView | null> {
  await enforceRateLimit(
    `ranch:view:${opts.rateKey}`,
    viewer.kind === 'user' ? RATE.viewUser : RATE.viewAnonymous,
  );
  const now = opts.now ?? new Date();

  const handle = handleParamSchema.safeParse(handleParam);
  if (!handle.success) return null;

  const [row] = await getDb()
    .select(SELECT)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.handle, handle.data), eq(users.status, 'active')))
    .limit(1);
  if (!row) return null;

  const { ranchVisibility, signalVisibility } = effectiveVisibility(row);
  const resource = { ownerId: row.userId, ranchVisibility, signalVisibility };
  const relationship = viewer.kind === 'user' ? await relationshipOf(row.userId, viewer.id) : 'UNKNOWN';
  const ctx = { relationship } as const;

  if (!can(viewer, 'profile:view', resource, ctx).allow) return null;
  // A visit: only a signed-in person opening someone else's Ranch, and only once the policy has allowed it. Recorded after the
  // response by whoever listens (the tracks module), so what this person receives never depends on it.
  if (viewer.kind === 'user' && viewer.id !== row.userId) {
    emit({ type: 'ranch.visited', viewerId: viewer.id, ownerId: row.userId });
  }
  const showSignal = can(viewer, 'signal:view', resource, ctx).allow;
  return toView(row, viewer.kind === 'user' && viewer.id === row.userId, now, showSignal);
}

export async function getOwnRanch(userId: string, now: Date = new Date()): Promise<OwnRanch> {
  const [row] = await getDb()
    .select(SELECT)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND');
  return {
    ...toView(row, true, now, true),
    ranchVisibility: row.ranchVisibility as Visibility,
    signalVisibility: row.signalVisibility as Visibility,
    fenceVisibility: row.fenceVisibility as Visibility,
    fencePosting: row.fencePosting as FencePosting,
    fenceReview: row.fenceReview,
    shadowWalk: row.shadowWalk,
    readReceipts: row.readReceipts,
    storyViews: row.storyViews,
    discoverable: row.discoverable,
  };
}

/**
 * The facts the Fence policy needs about `ownerId`'s Fence, or null when that person is missing or not active. Callers
 * treat null exactly like a Fence they may not see.
 */
export async function getFenceResource(ownerId: string): Promise<FenceResource | null> {
  const [row] = await getDb()
    .select(SELECT)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.id, ownerId), eq(users.status, 'active')))
    .limit(1);
  if (!row) return null;
  return {
    ownerId: row.userId,
    ...effectiveVisibility(row),
    fencePosting: row.fencePosting as FencePosting,
    fenceReview: row.fenceReview,
  };
}

/**
 * `getFenceResource` for many owners in ONE query (Phase 13): only active owners appear in the map. Same fields and the
 * same effective visibility as the single version, so callers get identical decisions with one round trip.
 */
export async function getFenceResources(ownerIds: string[]): Promise<Map<string, FenceResource>> {
  const ids = [...new Set(ownerIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select(SELECT)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(inArray(users.id, ids), eq(users.status, 'active')));
  return new Map(
    rows.map((row) => [
      row.userId,
      {
        ownerId: row.userId,
        ...effectiveVisibility(row),
        fencePosting: row.fencePosting as FencePosting,
        fenceReview: row.fenceReview,
      },
    ]),
  );
}

/** A person as other modules and pages need to show them. Never includes email, status or privacy settings. */
export interface PersonCard {
  userId: string;
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  /** The Howdy team account: shown with the Verified badge. */
  verified: boolean;
  /** Has earned the Trusted tick. */
  trusted: boolean;
}

const CARD = {
  userId: users.id,
  handle: users.handle,
  role: users.role,
  displayName: profiles.displayName,
  portraitTint: profiles.portraitTint,
  earnedTick,
} as const;

const toCard = ({
  role,
  earnedTick: earned,
  ...r
}: { role: string; portraitTint: string; earnedTick: boolean } & Omit<
  PersonCard,
  'portraitTint' | 'verified' | 'trusted'
>): PersonCard => ({
  ...r,
  portraitTint: r.portraitTint as PortraitTint,
  verified: isOfficial(role),
  trusted: showsTick(role, earned),
});

/** Find an ACTIVE person by handle (case-insensitive). Null for a malformed handle, a missing person or an inactive account. */
export async function resolveHandle(handleParam: string): Promise<PersonCard | null> {
  const handle = handleParamSchema.safeParse(handleParam);
  if (!handle.success) return null;
  const [row] = await getDb()
    .select(CARD)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.handle, handle.data), eq(users.status, 'active')))
    .limit(1);
  return row ? toCard(row) : null;
}

/** Cards for a set of user ids. Inactive or missing accounts are simply absent from the result. */
export async function getCards(userIds: string[]): Promise<Map<string, PersonCard>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb()
    .select(CARD)
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(inArray(users.id, [...new Set(userIds)]), eq(users.status, 'active')));
  return new Map(rows.map((r) => [r.userId, toCard(r)]));
}

/**
 * The Howdy team's current Signal, for everyone's Home: what is new in the app. Null when no team account has a live
 * Signal. (Visible to every signed-in person: the team account's Signal is open to everyone.)
 */
export async function getTeamAnnouncement(
  now: Date = new Date(),
): Promise<{ author: PersonCard; text: string; expiresAt: Date } | null> {
  const [row] = await getDb()
    .select({ ...CARD, signal: profiles.signal, signalExpiresAt: profiles.signalExpiresAt })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.role, 'admin'),
        eq(users.status, 'active'),
        isNotNull(profiles.signal),
        gt(profiles.signalExpiresAt, now),
      ),
    )
    .orderBy(desc(profiles.signalExpiresAt))
    .limit(1);
  if (!row?.signal || !row.signalExpiresAt) return null;
  const { signal, signalExpiresAt, ...card } = row;
  return { author: toCard(card), text: signal, expiresAt: signalExpiresAt };
}

/**
 * May this signed-in person open the Porch at `handleParam`? The page's own gate, run in its layout BEFORE the loading
 * outline streams, so a hidden or missing Porch answers a real 404 (once streaming starts the status is fixed at 200).
 * Check only: no view is built and no visit is recorded (layouts also run for link prefetches). It spends its own
 * rate-limit budget, so the view itself is not charged twice.
 */
export async function mayViewRanchByHandle(viewerId: string, handleParam: string): Promise<boolean> {
  await enforceRateLimit(`ranch:check:${viewerId}`, RATE.viewUser);
  const owner = await resolveHandle(handleParam);
  return owner !== null && mayViewRanch(viewerId, owner.userId);
}

/** Could `viewerId` open `ownerId`'s Ranch right now? Same policy as viewing, without producing the view. */
export async function mayViewRanch(viewerId: string, ownerId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({
      role: users.role,
      ranchVisibility: profiles.ranchVisibility,
      signalVisibility: profiles.signalVisibility,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.id, ownerId), eq(users.status, 'active')))
    .limit(1);
  if (!row) return false;
  const { ranchVisibility, signalVisibility } = effectiveVisibility(row);
  return can(
    { kind: 'user', id: viewerId, status: 'active' },
    'profile:view',
    { ownerId, ranchVisibility, signalVisibility },
    { relationship: await relationshipOf(ownerId, viewerId) },
  ).allow;
}

/**
 * `mayViewRanch` for many people at once, by handle, in three queries whatever their number: which of `handles` could
 * `viewerId` open right now? Answers handle → user id for those only (the viewer's own handle included). Built from the
 * batched lookups already proven equal to the single ones, then the same policy call, so every answer matches
 * `mayViewRanch` (tests/security/batch-equivalence.test.ts). Used to decide whose Portrait a list may show.
 */
export async function viewableRanches(viewerId: string, handles: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(handles)];
  if (wanted.length === 0) return new Map();
  const rows = await getDb()
    .select({ userId: users.id, handle: users.handle })
    .from(users)
    .where(and(inArray(users.handle, wanted), eq(users.status, 'active')));
  const ids = rows.map((r) => r.userId);
  const [resources, standings] = await Promise.all([getFenceResources(ids), fenceStandings(ids, viewerId)]);
  const out = new Map<string, string>();
  for (const { userId, handle } of rows) {
    const resource = resources.get(userId);
    const standing = standings.get(userId);
    if (!resource || !standing) continue;
    const { ranchVisibility, signalVisibility } = resource;
    const allowed =
      userId === viewerId ||
      can(
        { kind: 'user', id: viewerId, status: 'active' },
        'profile:view',
        { ownerId: userId, ranchVisibility, signalVisibility },
        { relationship: standing.relationship },
      ).allow;
    if (allowed) out.set(handle, userId);
  }
  return out;
}

/** Owner-only actions still go through the policy so there is exactly one place where "who may do what" is decided. */
async function assertMayEditOwn(userId: string, action: 'profile:edit' | 'signal:set'): Promise<void> {
  const decision = can(
    { kind: 'user', id: userId, status: 'active' },
    action,
    { ownerId: userId, ranchVisibility: 'members', signalVisibility: 'members' },
    { relationship: 'PASSERBY' },
  );
  if (!decision.allow) throw new AppError('FORBIDDEN');
}

/** Change the caller's own Ranch. Only the whitelisted fields in `patch` can change; the target is always `userId`. */
export async function updateRanch(userId: string, patch: RanchPatch): Promise<OwnRanch> {
  await assertMayEditOwn(userId, 'profile:edit');
  await enforceRateLimit(`ranch:edit:${userId}`, RATE.edit);
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.bio !== undefined) set.bio = patch.bio === '' ? null : patch.bio;
  if (patch.portraitTint !== undefined) set.portraitTint = patch.portraitTint;
  if (patch.ranchVisibility !== undefined) set.ranchVisibility = patch.ranchVisibility;
  if (patch.signalVisibility !== undefined) set.signalVisibility = patch.signalVisibility;
  if (patch.fenceVisibility !== undefined) set.fenceVisibility = patch.fenceVisibility;
  if (patch.fencePosting !== undefined) set.fencePosting = patch.fencePosting;
  if (patch.fenceReview !== undefined) set.fenceReview = patch.fenceReview;
  if (patch.shadowWalk !== undefined) set.shadowWalk = patch.shadowWalk;
  if (patch.readReceipts !== undefined) set.readReceipts = patch.readReceipts;
  if (patch.storyViews !== undefined) set.storyViews = patch.storyViews;
  if (patch.discoverable !== undefined) set.discoverable = patch.discoverable;
  await getDb().update(profiles).set(set).where(eq(profiles.userId, userId));
  return getOwnRanch(userId);
}

/** Set the caller's Signal; it expires after 12 hours. */
export async function setSignal(userId: string, text: string, now: Date = new Date()): Promise<OwnRanch> {
  await assertMayEditOwn(userId, 'signal:set');
  await enforceRateLimit(`ranch:signal:${userId}`, RATE.signal);
  await getDb()
    .update(profiles)
    .set({
      signal: text,
      signalSetAt: now,
      signalExpiresAt: new Date(now.getTime() + SIGNAL_TTL_MS),
      updatedAt: now,
    })
    .where(eq(profiles.userId, userId));
  return getOwnRanch(userId, now);
}

export async function clearSignal(userId: string): Promise<OwnRanch> {
  await assertMayEditOwn(userId, 'signal:set');
  await enforceRateLimit(`ranch:signal:${userId}`, RATE.signal);
  await getDb()
    .update(profiles)
    .set({ signal: null, signalSetAt: null, signalExpiresAt: null, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
  return getOwnRanch(userId);
}

/** Retention: physically remove Signals that have expired (reads already ignore them). Returns how many were cleared. */
export async function clearExpiredSignals(now: Date = new Date()): Promise<number> {
  const rows = await getDb()
    .update(profiles)
    .set({ signal: null, signalSetAt: null, signalExpiresAt: null })
    .where(and(isNotNull(profiles.signalExpiresAt), lte(profiles.signalExpiresAt, now)))
    .returning({ userId: profiles.userId });
  return rows.length;
}

/** Is this person on Shadow Walk? Private: only the tracks module and the person themselves ever ask. */
export async function isShadowWalking(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ on: profiles.shadowWalk })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return row?.on ?? false;
}

/**
 * Which of these people share their Story views (ADR-047)? Private: only the stories module asks, and it never says who
 * has it off.
 */
export async function sharingStoryViews(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await getDb()
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(and(inArray(profiles.userId, [...new Set(userIds)]), eq(profiles.storyViews, true)));
  return new Set(rows.map((r) => r.userId));
}

/** Do both of these people have read receipts on? Private: only the whispers module asks, and it never says which one is off. */
export async function bothShareReceipts(a: string, b: string): Promise<boolean> {
  const rows = await getDb()
    .select({ on: profiles.readReceipts })
    .from(profiles)
    .where(inArray(profiles.userId, [a, b]));
  return rows.length === 2 && rows.every((r) => r.on);
}
