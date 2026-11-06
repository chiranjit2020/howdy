import { credentials } from '@db/schema';
import { eq } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { verifyPassword } from './crypto';

/**
 * "Prove it's you again" before something a session left open on a shared phone must not be enough for: downloading
 * the data, closing the account, changing sign-in security. Someone with a password types it. Someone who joined with
 * Google (ADR-048) has none, so they confirm with Google instead: Google makes them sign in again, and the callback
 * leaves a short-lived proof tied to this one session (google.ts, startGoogleConfirm / googleConfirmedFor).
 */
export interface IdentityProof {
  password?: string | undefined;
  /** This session confirmed with Google in the last few minutes. */
  googleConfirmed: boolean;
}

export const NO_PASSWORD_MESSAGE =
  'You joined with Google, so confirm it’s you with Google first, then try again.';
const WRONG_PASSWORD = 'That password is not right.';

/** Does this account have a password? (No: they joined with Google and never set one.) */
export async function hasPassword(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ userId: credentials.userId })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  return Boolean(row);
}

/**
 * Check the proof. An account with a password needs that password (a Google confirmation is not a substitute, so a
 * password account is exactly as before). An account without one needs a fresh Google confirmation. Callers apply
 * their own rate limit first. Throws a field error on `password` either way, so every form shows it in one place.
 */
export async function verifyIdentity(userId: string, proof: IdentityProof): Promise<void> {
  const [row] = await getDb()
    .select({ passwordHash: credentials.passwordHash })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  if (!row) {
    if (proof.googleConfirmed) return;
    throw new AppError('BAD_REQUEST', {
      message: NO_PASSWORD_MESSAGE,
      fields: { password: NO_PASSWORD_MESSAGE },
    });
  }
  if (!proof.password || !(await verifyPassword(row.passwordHash, proof.password))) {
    throw new AppError('BAD_REQUEST', { message: WRONG_PASSWORD, fields: { password: WRONG_PASSWORD } });
  }
}
