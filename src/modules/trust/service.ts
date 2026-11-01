import { trustTicks } from '@db/schema';
import { asc, eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import type { DomainEvent } from '@/platform/events';

/**
 * The Trusted tick (ADR-020): earned, never bought or asked for. It is a CHECKLIST where every item must pass, not a
 * weighted score (master prompt §32: "do not rely on a single trust score") — so a person can always be told exactly
 * what is left, and no single signal can carry them over the line. Since ADR-052 it is a safety signal for people who
 * do not know you yet, built only from things that are hard to fake; the words friends pick (Marks) play no part, so
 * nothing rewards swapping them.
 *
 * The numbers are sized for a small group of friends. They live here, in one place, so they can be raised as Howdy grows.
 */
export const TRUST_RULES = {
  /** The account has existed at least this long. */
  accountAgeDays: 30,
  /** Settled friends: accepted Pals whose accounts are active and at least `friendMinAgeDays` old. */
  minPals: 3,
  /** A friend's account younger than this does not count yet (a fresh account made to vouch for someone). */
  friendMinAgeDays: 14,
  /** Signed in at least this recently. */
  activeWithinDays: 30,
  /** No report against the person that a moderator upheld in this long. Open reports never count: anyone can file one. */
  standingDays: 180,
} as const;

/** How long a stored decision is trusted before the next visit to the person's Porch checks it again. */
export const RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrustCheckKey = 'email' | 'age' | 'portrait' | 'pals' | 'active' | 'standing';

export interface TrustCheck {
  key: TrustCheckKey;
  met: boolean;
  /** For countable checks: how far along the person is, and what is needed. */
  have?: number;
  need?: number;
}

export interface TrustStatus {
  /** Has the tick right now. */
  earned: boolean;
  earnedAt: Date | null;
  /** The Howdy team account carries its own Verified badge and is never checked. */
  team: boolean;
  checks: TrustCheck[];
}

export interface Facts {
  status: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  portrait: boolean;
  /** Settled friends (see TRUST_RULES.minPals). */
  pals: number;
  lastSeenAt: Date | null;
  upheldReports: number;
}

/** Everything the checklist needs about one person, read in a handful of small queries at once. Null if they do not exist. */
async function gatherFacts(userId: string, now: Date): Promise<Facts | null> {
  const db = getDb();
  const friendBornBy = new Date(now.getTime() - TRUST_RULES.friendMinAgeDays * DAY_MS);
  const standingSince = new Date(now.getTime() - TRUST_RULES.standingDays * DAY_MS);
  const [user, portrait, pals, seen, reports] = await Promise.all([
    db.execute<{ status: string; role: string; verified: boolean; created_at: Date }>(sql`
      select status, role, email_verified_at is not null as verified, created_at from users where id = ${userId}`),
    db.execute<{ n: number }>(sql`
      select count(*)::int n from media where owner_id = ${userId} and kind = 'portrait' and status = 'ready'`),
    db.execute<{ n: number }>(sql`
      select count(*)::int n from posse_links p
      join users o on o.id = case when p.user_low = ${userId} then p.user_high else p.user_low end
      where (p.user_low = ${userId} or p.user_high = ${userId}) and p.status = 'accepted' and o.status = 'active'
        and o.created_at <= ${friendBornBy}`),
    db.execute<{ at: Date | null }>(sql`
      select max(last_seen_at) at from sessions where user_id = ${userId}`),
    db.execute<{ n: number }>(sql`
      select count(*)::int n from reports
      where target_user_id = ${userId} and status = 'actioned'
        and coalesce(reviewed_at, created_at) > ${standingSince}`),
  ]);
  const u = user.rows[0];
  if (!u) return null;
  const at = seen.rows[0]?.at ?? null;
  return {
    status: u.status,
    role: u.role,
    emailVerified: u.verified,
    createdAt: new Date(u.created_at),
    portrait: (portrait.rows[0]?.n ?? 0) > 0,
    pals: pals.rows[0]?.n ?? 0,
    lastSeenAt: at === null ? null : new Date(at),
    upheldReports: reports.rows[0]?.n ?? 0,
  };
}

/** The checklist, from the facts. Pure, so every rule can be tested without a database. */
export function judge(f: Facts, now: Date): TrustCheck[] {
  const ageDays = Math.floor((now.getTime() - f.createdAt.getTime()) / DAY_MS);
  const activeSince = now.getTime() - TRUST_RULES.activeWithinDays * DAY_MS;
  const counted = (key: TrustCheckKey, have: number, need: number): TrustCheck => ({
    key,
    met: have >= need,
    have: Math.min(have, need),
    need,
  });
  return [
    { key: 'email', met: f.emailVerified },
    counted('age', ageDays, TRUST_RULES.accountAgeDays),
    { key: 'portrait', met: f.portrait },
    counted('pals', f.pals, TRUST_RULES.minPals),
    { key: 'active', met: f.lastSeenAt !== null && f.lastSeenAt.getTime() >= activeSince },
    { key: 'standing', met: f.status === 'active' && f.upheldReports === 0 },
  ];
}

const isTeam = (role: string) => role === 'admin';

/**
 * Check `userId` now and store the result. Keeps the original `earnedAt` while they keep passing, so the date means
 * "has held it since". Returns null for a person who does not exist.
 */
export async function recheckTrust(userId: string, now: Date = new Date()): Promise<TrustStatus | null> {
  const facts = await gatherFacts(userId, now);
  if (!facts) return null;
  const team = isTeam(facts.role);
  const checks = judge(facts, now);
  const passes = !team && checks.every((c) => c.met);
  const [row] = await getDb()
    .insert(trustTicks)
    .values({ userId, earnedAt: passes ? now : null, checkedAt: now })
    .onConflictDoUpdate({
      target: trustTicks.userId,
      set: {
        earnedAt: passes ? sql`coalesce(${trustTicks.earnedAt}, ${now})` : null,
        checkedAt: now,
      },
    })
    .returning({ earnedAt: trustTicks.earnedAt });
  const earnedAt = row?.earnedAt ?? null;
  return { earned: earnedAt !== null, earnedAt, team, checks };
}

/**
 * Re-check `userId` only if their stored decision is older than `RECHECK_AFTER_MS` (or missing). For busy paths — a
 * visit to their Porch — so a popular Porch costs one check every few hours, not one per visit.
 */
export async function recheckTrustIfStale(userId: string, now: Date = new Date()): Promise<void> {
  const [row] = await getDb()
    .select({ checkedAt: trustTicks.checkedAt })
    .from(trustTicks)
    .where(eq(trustTicks.userId, userId))
    .limit(1);
  if (row && now.getTime() - row.checkedAt.getTime() < RECHECK_AFTER_MS) return;
  await recheckTrust(userId, now);
}

/**
 * The daily job: re-check everyone whose decision is more than a day old, oldest first, so a tick is lost (inactive,
 * Marks aged out, a report upheld) or gained (the account came of age) even if nobody visits. Bounded per run.
 */
export async function recheckStaleTrust(
  now: Date = new Date(),
  limit = 500,
): Promise<{ trustRechecked: number }> {
  const rows = await getDb()
    .select({ userId: trustTicks.userId })
    .from(trustTicks)
    .where(lt(trustTicks.checkedAt, new Date(now.getTime() - DAY_MS)))
    .orderBy(asc(trustTicks.checkedAt))
    .limit(limit);
  for (const r of rows) await recheckTrust(r.userId, now);
  return { trustRechecked: rows.length };
}

/**
 * Keep ticks current as things happen (wired in src/app/_lib/wire-events.ts). A new Pal can complete the checklist, so
 * that re-checks at once (Marks no longer count, ADR-052); a visit re-checks the owner only when their decision is getting old, which is also
 * how a lost Pal or a quiet spell shows up without a job.
 */
export async function handleEvent(event: DomainEvent): Promise<void> {
  switch (event.type) {
    case 'posse.accepted':
      await Promise.all([recheckTrust(event.actorId), recheckTrust(event.targetId)]);
      return;
    case 'ranch.visited':
      await recheckTrustIfStale(event.ownerId);
      return;
    default:
      return;
  }
}
