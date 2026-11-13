import { pushSubscriptions, sessions, users } from '@db/schema';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { logger } from '@/platform/logger';
import { getRedis } from '@/platform/redis';
import type { PushPayload } from '@/shared/validation/push';
import { pushTo } from './service';

/**
 * A one-off announcement from the Howdy team, pushed to every phone that has notifications switched on (2026-11-14, the
 * user's ask). It goes out once, inside its window, to people signed in on a device with notifications on, except
 * anyone who has muted or blocked the team account (or been blocked by it), the same rule that hides the team's
 * "What's new" note from them.
 */
export interface Announcement {
  /** Also the send-once key: changing it would send again. */
  id: string;
  /** Not before this moment (a scheduled job may run late, never early). */
  notBefore: Date;
  /** Not after this either: a job that runs a day late stays silent rather than announcing stale news. */
  notAfter: Date;
  /** Everything but the app-icon badge, which is each person's own unread count. */
  payload: Omit<PushPayload, 'badge'>;
}

/** "Buy or wait?" (ADR-066), the user's chosen words and time: Saturday 15 Nov 2026, 7:30 pm IST (14:00 UTC). */
export const BUY_OR_WAIT_ANNOUNCEMENT: Announcement = {
  id: 'buy-or-wait-2026-11-15',
  notBefore: new Date('2026-11-15T14:00:00Z'),
  notAfter: new Date('2026-11-16T02:00:00Z'),
  payload: {
    title: 'Howdy',
    body: 'New: Buy or wait? Thinking of buying something? Ask your friends or everyone. They answer Buy or Wait, with a reason.',
    url: '/buy-or-wait',
    tag: 'announce:buy-or-wait-2026-11-15',
  },
};

const SENT_TTL_SECONDS = 60 * 24 * 60 * 60;

export type AnnounceResult =
  | { status: 'sent'; people: number; devices: number }
  | { status: 'skipped'; reason: 'too_early' | 'too_late' | 'already_sent' | 'no_guard' };

/** Everyone with at least one device they can still be pushed on (live session), active accounts only. */
async function peopleWithPush(now: Date): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ id: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
    .innerJoin(users, eq(users.id, pushSubscriptions.userId))
    .where(
      and(
        eq(sessions.userId, pushSubscriptions.userId),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
        eq(users.status, 'active'),
      ),
    );
  return rows.map((r) => r.id);
}

/** The team: the admin accounts (they carry the Verified badge and post "What's new"). */
async function teamIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
  return rows.map((r) => r.id);
}

/**
 * Send the announcement if it is due and has not gone out yet. The send-once mark is taken BEFORE anything is sent,
 * so two runs can never both send; if a run dies half way, some people miss it rather than anyone getting it twice.
 * Without Redis (where the mark lives) it refuses to send.
 */
export async function sendAnnouncement(
  a: Announcement,
  /** From the app layer (push depends on no module): has this person hidden the team (or the team them), and their badge. */
  hooks: {
    hidesTeam: (userId: string, teamIds: string[]) => Promise<boolean>;
    badgeFor: (userId: string) => Promise<number>;
  },
  now: Date = new Date(),
): Promise<AnnounceResult> {
  if (now < a.notBefore) return { status: 'skipped', reason: 'too_early' };
  if (now > a.notAfter) return { status: 'skipped', reason: 'too_late' };
  const redis = getRedis();
  if (!redis) return { status: 'skipped', reason: 'no_guard' };
  const first = await redis.set(`announce:${a.id}`, now.toISOString(), 'EX', SENT_TTL_SECONDS, 'NX');
  if (first !== 'OK') return { status: 'skipped', reason: 'already_sent' };

  const [people, team] = await Promise.all([peopleWithPush(now), teamIds()]);
  let reached = 0;
  let devices = 0;
  for (const userId of people) {
    try {
      if (team.length && (await hooks.hidesTeam(userId, team))) continue;
      const n = await pushTo(userId, { ...a.payload, badge: await hooks.badgeFor(userId) }, now);
      if (n > 0) reached += 1;
      devices += n;
    } catch (err) {
      logger.warn({ event: 'announce.person_failed', err });
    }
  }
  logger.info({ event: 'announce.sent', id: a.id, people: reached, devices, candidates: people.length });
  return { status: 'sent', people: reached, devices };
}

/** Is this person on the Howdy team (an active admin)? Only they may preview an announcement. */
export async function isTeamMember(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.role, 'admin'), eq(users.status, 'active')))
    .limit(1);
  return row !== undefined;
}

/**
 * Send the announcement to ONE team member's own devices, to see it on a phone before it goes out (2026-11-14, the
 * user's ask). It never touches the send-once mark, so the real send still happens. Returns how many devices it reached
 * (0 = notifications are not on for this account on any device it is signed in on).
 */
export async function previewAnnouncement(a: Announcement, userId: string, badge: number): Promise<number> {
  return pushTo(userId, { ...a.payload, tag: `${a.payload.tag}:preview`, badge });
}

/** Has this announcement not gone past its window yet (so the team may still preview it)? */
export const announcementPending = (a: Announcement, now: Date = new Date()): boolean => now <= a.notAfter;
