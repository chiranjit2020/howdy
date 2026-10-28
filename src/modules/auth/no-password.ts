import { credentials } from '@db/schema';
import { eq } from 'drizzle-orm';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';

/**
 * Someone who joined with Google (ADR-048) has no password until they set one. The places that ask for the password
 * again (closing the account, downloading data, changing sign-in security) say so plainly instead of "wrong password",
 * and point at the way to set one: "Forgot password?" emails a link to the address Google already verified.
 */
export const NO_PASSWORD_MESSAGE =
  'Your account does not have a password yet (you joined with Google). Set one with “Forgot password?” on the log-in page, then try again.';

export async function assertHasPassword(userId: string): Promise<void> {
  const [row] = await getDb()
    .select({ userId: credentials.userId })
    .from(credentials)
    .where(eq(credentials.userId, userId))
    .limit(1);
  if (!row) {
    throw new AppError('BAD_REQUEST', {
      message: NO_PASSWORD_MESSAGE,
      fields: { password: NO_PASSWORD_MESSAGE },
    });
  }
}
