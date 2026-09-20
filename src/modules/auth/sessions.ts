import { sessions, users } from '@db/schema';
import { and, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { hashToken, newToken } from './crypto';
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, SESSION_TOUCH_INTERVAL_MS } from './config';

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  emailVerifiedAt: Date | null;
}

export interface SessionContext {
  sessionId: string;
  user: SessionUser;
}

export interface SessionSummary {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
}

/** Coarse "Browser on OS" label for the Open Gates list. Derived from the User-Agent, which is not stored. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : undefined;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : undefined;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Create a session and return the secret token (to be set as a cookie once; it cannot be recovered later). */
export async function createSession(
  userId: string,
  userAgent: string | null | undefined,
  now: Date = new Date(),
): Promise<{ token: string; sessionId: string; maxAgeSec: number }> {
  const { token, hash } = newToken();
  const absolute = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  const idle = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, absolute.getTime()));
  const [row] = await getDb()
    .insert(sessions)
    .values({
      userId,
      tokenHash: hash,
      deviceLabel: deviceLabel(userAgent),
      lastSeenAt: now,
      idleExpiresAt: idle,
      absoluteExpiresAt: absolute,
    })
    .returning({ id: sessions.id });
  return { token, sessionId: row!.id, maxAgeSec: Math.floor(SESSION_ABSOLUTE_MS / 1000) };
}

/**
 * Resolve a cookie token to a live session + user, or null. A session is live only if it is not revoked, within both its
 * idle and absolute expiry, AND its account is `active`. Expiry is always checked here, server-side; the cookie's
 * Max-Age is only a hint to the browser.
 */
export async function validateSession(token: string, now: Date = new Date()): Promise<SessionContext | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      absoluteExpiresAt: sessions.absoluteExpiresAt,
      userId: users.id,
      email: users.email,
      handle: users.handle,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) return null;

  // Sliding idle window, throttled so activity does not cost a write on every request.
  if (now.getTime() - row.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const idle = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, row.absoluteExpiresAt.getTime()));
    await db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: idle })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    user: { id: row.userId, email: row.email, handle: row.handle, emailVerifiedAt: row.emailVerifiedAt },
  };
}

/** Revoke by cookie token (logout / fixation defence). Returns whether a live session was revoked. */
export async function revokeSessionByToken(token: string, now: Date = new Date()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const rows = await getDb()
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/**
 * Revoke one session, but ONLY if it belongs to `userId` (object-level authorisation lives in the WHERE clause, so a
 * foreign or non-existent id is indistinguishable: both return false).
 */
export async function revokeOwnedSession(
  userId: string,
  sessionId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await getDb()
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/** Revoke every live session of a user, optionally keeping one (the current device). */
export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
  now: Date = new Date(),
): Promise<number> {
  const conds = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) conds.push(ne(sessions.id, exceptSessionId));
  const rows = await getDb()
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(...conds))
    .returning({ id: sessions.id });
  return rows.length;
}

/** The user's live sessions, newest activity first. */
export async function listSessions(
  userId: string,
  currentSessionId: string,
  now: Date = new Date(),
): Promise<SessionSummary[]> {
  const rows = await getDb()
    .select({
      id: sessions.id,
      deviceLabel: sessions.deviceLabel,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
}
