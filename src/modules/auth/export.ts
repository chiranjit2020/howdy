import { credentials, legalAcceptances, sessions, users } from '@db/schema';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { enforceRateLimit } from '@/platform/rate-limit';
import { audit } from './audit';
import { RATE } from './config';
import { verifyPassword } from './crypto';

/**
 * "Download my data" (ADR-037). The password is asked for again, like deleting the account: a session left open on a
 * shared phone must not be enough to walk away with everything. Two limits: attempts (spent before the password is
 * checked, like a sign-in) and finished exports (spent only once the password is right).
 */
export async function verifyForExport(
  userId: string,
  password: string,
  ctx: { requestId: string },
): Promise<void> {
  await enforceRateLimit(`auth:export-try:${userId}`, RATE.exportAttempt);
  const [row] = await getDb()
    .select({ passwordHash: credentials.passwordHash })
    .from(credentials)
    .innerJoin(users, eq(users.id, credentials.userId))
    .where(and(eq(credentials.userId, userId), eq(users.status, 'active')))
    .limit(1);
  if (!row || !(await verifyPassword(row.passwordHash, password))) {
    throw new AppError('BAD_REQUEST', {
      message: 'That password is not right.',
      fields: { password: 'That password is not right.' },
    });
  }
  await enforceRateLimit(`auth:export:${userId}`, RATE.exportDone);
  await audit('data_exported', { userId, requestId: ctx.requestId });
}

export interface AccountExport {
  callSign: string;
  email: string;
  emailConfirmedAt: string | null;
  joinedAt: string;
  /** Signed-in devices that are still live ("Open Gates"): a coarse label, never an address. */
  devices: { device: string; signedInAt: string; lastSeenAt: string }[];
  /** Which versions of the Terms and Privacy Policy I agreed to, and when. */
  agreements: { document: string; version: string; agreedAt: string }[];
}

/** My account, as I would see it across the Workshop: nothing here is about anyone else. */
export async function accountExport(userId: string, now: Date = new Date()): Promise<AccountExport> {
  const db = getDb();
  const [[user], live, agreed] = await Promise.all([
    db
      .select({
        handle: users.handle,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({
        device: sessions.deviceLabel,
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
      .orderBy(desc(sessions.lastSeenAt)),
    db
      .select({
        document: legalAcceptances.document,
        version: legalAcceptances.version,
        acceptedAt: legalAcceptances.acceptedAt,
      })
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, userId))
      .orderBy(asc(legalAcceptances.acceptedAt)),
  ]);
  if (!user) throw new AppError('NOT_FOUND');
  return {
    callSign: user.handle,
    email: user.email,
    emailConfirmedAt: user.emailVerifiedAt?.toISOString() ?? null,
    joinedAt: user.createdAt.toISOString(),
    devices: live.map((s) => ({
      device: s.device,
      signedInAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
    agreements: agreed.map((a) => ({
      document: a.document,
      version: a.version,
      agreedAt: a.acceptedAt.toISOString(),
    })),
  };
}
