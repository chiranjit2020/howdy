import { randomInt } from 'node:crypto';
import { invitations, inviteLinks } from '@db/schema';
import { and, count, eq, gt, isNull, lt } from 'drizzle-orm';
import { getCards } from '@/modules/profiles';
import { act } from '@/modules/relationships';
import { getDb } from '@/platform/db';
import type { DomainEvent } from '@/platform/events';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import { INVITE_CODE_PATTERN } from '@/shared/validation/invites';

/**
 * Invite links (ADR-045). Every member may have one personal link, /i/<code>, to post anywhere. Someone who signs up
 * through it is remembered as invited; when they confirm their email, an ordinary Pal request goes from them to the
 * inviter, who decides. Nothing is granted automatically, so a link that travels further than meant cannot make
 * strangers into Pals. Resetting the link kills the old one at once.
 */

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
export const INVITE_RATE = {
  read: rule(120, 60),
  reset: rule(10, 86_400),
} as const;

/** Sign-ups one link may bring in a week; beyond it people still join, just without the Pal request. */
export const INVITE_WEEKLY_CAP = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Invitations are forgotten this long after sign-up (they only feed the weekly cap and the Pal request). */
export const INVITATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export interface MyInvite {
  code: string;
  /** People who signed up through it in the last 7 days. */
  joinedThisWeek: number;
}

async function joinedSince(inviterId: string, since: Date): Promise<number> {
  const [{ n } = { n: 0 }] = await getDb()
    .select({ n: count() })
    .from(invitations)
    .where(and(eq(invitations.inviterId, inviterId), gt(invitations.createdAt, since)));
  return n;
}

/** My invite link — made the first time I ask for it. */
export async function myInvite(userId: string, now: Date = new Date()): Promise<MyInvite> {
  await enforceRateLimit(`invites:read:${userId}`, INVITE_RATE.read);
  const db = getDb();
  let [row] = await db.select().from(inviteLinks).where(eq(inviteLinks.userId, userId)).limit(1);
  if (!row) {
    // A clash on the code (one in 57^10) or a racing first request just tries again / reads what the other wrote.
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      [row] = await db
        .insert(inviteLinks)
        .values({ userId, code: newCode() })
        .onConflictDoNothing()
        .returning();
      if (!row) [row] = await db.select().from(inviteLinks).where(eq(inviteLinks.userId, userId)).limit(1);
    }
  }
  return { code: row!.code, joinedThisWeek: await joinedSince(userId, new Date(now.getTime() - WEEK_MS)) };
}

/** A new code for my link; the old one stops working at once. */
export async function resetInvite(userId: string): Promise<MyInvite> {
  await enforceRateLimit(`invites:reset:${userId}`, INVITE_RATE.reset);
  const code = newCode();
  await getDb()
    .insert(inviteLinks)
    .values({ userId, code })
    .onConflictDoUpdate({ target: inviteLinks.userId, set: { code, createdAt: new Date() } });
  return myInvite(userId);
}

/** Who a code belongs to, if it is a live link of an active account; null otherwise (made up, reset, gone). */
async function ownerOf(code: string): Promise<string | null> {
  if (!INVITE_CODE_PATTERN.test(code)) return null;
  const [row] = await getDb()
    .select({ userId: inviteLinks.userId })
    .from(inviteLinks)
    .where(eq(inviteLinks.code, code))
    .limit(1);
  if (!row) return null;
  return (await getCards([row.userId])).has(row.userId) ? row.userId : null;
}

/**
 * What an invite page may show: the inviter's display name and nothing else (no call sign, no portrait — the user's
 * choice). Null for a link that does not work, which then shows as the plain welcome page.
 */
export async function inviterName(code: string): Promise<string | null> {
  const ownerId = await ownerOf(code);
  if (!ownerId) return null;
  return (await getCards([ownerId])).get(ownerId)?.displayName ?? null;
}

/**
 * Remember that a brand-new account signed up through `code`. Silent in every case — a bad code, a reset link, an
 * inviter over the weekly cap — because the sign-up response must look the same whatever happened.
 */
export async function recordInvitation(
  inviteeId: string,
  code: string,
  now: Date = new Date(),
): Promise<void> {
  const inviterId = await ownerOf(code);
  if (!inviterId || inviterId === inviteeId) return;
  if ((await joinedSince(inviterId, new Date(now.getTime() - WEEK_MS))) >= INVITE_WEEKLY_CAP) return;
  await getDb().insert(invitations).values({ inviteeId, inviterId, createdAt: now }).onConflictDoNothing();
}

/**
 * The invited person has confirmed their email: send their Pal request to the inviter, once. It goes through the
 * ordinary request path, so blocks, budgets and Chimes behave exactly as if they had tapped "Ask" themselves.
 */
export async function redeemInvitation(inviteeId: string, now: Date = new Date()): Promise<boolean> {
  const [claimed] = await getDb()
    .update(invitations)
    .set({ redeemedAt: now })
    .where(and(eq(invitations.inviteeId, inviteeId), isNull(invitations.redeemedAt)))
    .returning({ inviterId: invitations.inviterId });
  if (!claimed) return false;
  if (!(await getCards([claimed.inviterId])).has(claimed.inviterId)) return false; // inviter suspended or gone
  await act(inviteeId, claimed.inviterId, 'request');
  return true;
}

/** Retention: invitations are deleted 30 days after sign-up, redeemed or not. */
export async function purgeOldInvitations(now: Date = new Date()): Promise<{ invitations: number }> {
  const rows = await getDb()
    .delete(invitations)
    .where(lt(invitations.createdAt, new Date(now.getTime() - INVITATION_RETENTION_MS)))
    .returning({ id: invitations.inviteeId });
  return { invitations: rows.length };
}

/** Listens to sign-up and email confirmation (wired in src/app/_lib/wire-events.ts). */
export async function handleEvent(event: DomainEvent): Promise<void> {
  if (event.type === 'account.created' && event.invite) await recordInvitation(event.userId, event.invite);
  if (event.type === 'account.verified') await redeemInvitation(event.userId);
}
