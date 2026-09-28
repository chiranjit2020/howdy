import { pushSubscriptions, sessions } from '@db/schema';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import webpush from 'web-push';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { logger } from '@/platform/logger';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { PushPayload, PushSubscribeInput } from '@/shared/validation/push';

const rule = (limit: number, windowSec: number): RateLimitRule => ({ limit, windowSec });
/** Every app start re-sends the device's subscription, so the budget is generous; it only stops a script. */
export const RATE = { manage: rule(60, 3600) } as const;
/** Devices per person. A new one past this pushes out the oldest. */
export const MAX_DEVICES = 10;
/** How long a push service may hold a notification for a phone that is offline. */
const TTL_SECONDS = 24 * 60 * 60;

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
/** Delivers one push; returns the push service's HTTP status. Replaceable in tests. */
export type PushSender = (target: PushTarget, payload: string) => Promise<number>;

let testSender: PushSender | null = null;
/** Tests only: capture pushes instead of sending them (also works without VAPID keys). */
export function setPushSender(sender: PushSender | null): void {
  testSender = sender;
}

function realSender(): PushSender | null {
  const env = getEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const vapidDetails = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  return async (target, payload) => {
    try {
      const res = await webpush.sendNotification(target, payload, {
        vapidDetails,
        TTL: TTL_SECONDS,
        urgency: 'normal',
        timeout: 10_000,
      });
      return res.statusCode;
    } catch (err) {
      if (err instanceof webpush.WebPushError) return err.statusCode;
      throw err;
    }
  };
}

/** Is Web Push set up on this server? The browser side hides its switch when it is not. */
export function pushPublicKey(): string | undefined {
  return getEnv().VAPID_PUBLIC_KEY;
}

/**
 * Remember this device for this session. The same endpoint (one browser) always has one row: re-subscribing after signing in
 * as someone else moves it to the new person and session, so the old account stops reaching that phone.
 */
export async function subscribe(
  ctx: { userId: string; sessionId: string },
  input: PushSubscribeInput,
): Promise<void> {
  await enforceRateLimit(`push:manage:${ctx.userId}`, RATE.manage);
  const db = getDb();
  const values = {
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  };
  await db
    .insert(pushSubscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: values.userId, sessionId: values.sessionId, p256dh: values.p256dh, auth: values.auth },
    });
  const mine = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, ctx.userId))
    .orderBy(asc(pushSubscriptions.createdAt));
  const extra = mine.slice(0, Math.max(0, mine.length - MAX_DEVICES)).map((r) => r.id);
  if (extra.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, extra));
}

/** Forget this device. Only ever my own row; an endpoint that is not mine is the same quiet success. */
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await enforceRateLimit(`push:manage:${userId}`, RATE.manage);
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/** A session that can still be used: not revoked, not idle-expired, not past its absolute limit. */
const liveSession = (now: Date) =>
  and(isNull(sessions.revokedAt), gt(sessions.idleExpiresAt, now), gt(sessions.absoluteExpiresAt, now));

/**
 * Push to every device this person is signed in on right now. Never throws (a push is a nicety: the Chime is already stored);
 * a device the push service says is gone (404/410) is forgotten.
 */
export async function pushTo(userId: string, payload: PushPayload, now: Date = new Date()): Promise<number> {
  const send = testSender ?? realSender();
  if (!send) return 0;
  const db = getDb();
  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .innerJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
    .where(and(eq(pushSubscriptions.userId, userId), eq(sessions.userId, userId), liveSession(now)));
  const body = JSON.stringify(payload);
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    targets.map(async (t) => {
      try {
        const status = await send({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body);
        if (status === 404 || status === 410) gone.push(t.id);
        else if (status >= 200 && status < 300) sent += 1;
        else logger.warn({ event: 'push.rejected', status });
      } catch (err) {
        logger.warn({ event: 'push.failed', err });
      }
    }),
  );
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
  return sent;
}

/** Retention: forget devices whose session has ended (they could never be pushed to again). */
export async function purgeDeadSubscriptions(now: Date = new Date()): Promise<{ devices: number }> {
  const db = getDb();
  const dead = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      or(
        isNotNull(sessions.revokedAt),
        lte(sessions.idleExpiresAt, now),
        lte(sessions.absoluteExpiresAt, now),
      ),
    );
  const rows = await db
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.sessionId, dead))
    .returning({ id: pushSubscriptions.id });
  return { devices: rows.length };
}
