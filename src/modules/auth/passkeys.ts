import { passkeys, users, webauthnChallenges } from '@db/schema';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, count, eq, gt, lt } from 'drizzle-orm';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { logger } from '@/platform/logger';
import { enforceRateLimit } from '@/platform/rate-limit';
import type { RequestContext } from './accounts';
import { audit } from './audit';
import { MAX_PASSKEYS, RATE, WEBAUTHN_CHALLENGE_TTL_MS } from './config';
import { keyDigest } from './crypto';
import { deviceLabel } from './sessions';
import {
  afterFactorRemoved,
  announceFactorAdded,
  announceFactorRemoved,
  confirmPassword,
  factorAddedIn,
} from './two-step';

/**
 * Passkeys (ADR-040), through @simplewebauthn/server — a vetted WebAuthn library, as ADR-003 asked, not hand-rolled.
 * The relying party is this site's own host name, and only this site's own origin is accepted, so a passkey made here
 * cannot be used by a look-alike site (that is what makes passkeys phishing-proof). User verification (the fingerprint,
 * face or screen lock) is REQUIRED: a passkey stands in for a password AND a second step, so it must prove both.
 */

/** EdDSA, ES256, RS256: what every platform authenticator offers. Pinned so a library default cannot drift. */
const ALGORITHMS = [-8, -7, -257];

function relyingParty() {
  const url = new URL(getEnv().APP_URL);
  return { rpID: url.hostname, origin: url.origin, rpName: 'Howdy' };
}

async function newChallenge(purpose: 'register' | 'sign_in', challenge: string, userId?: string) {
  const [row] = await getDb()
    .insert(webauthnChallenges)
    .values({
      challenge,
      purpose,
      userId: userId ?? null,
      expiresAt: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS),
    })
    .returning({ id: webauthnChallenges.id });
  return row!.id;
}

/**
 * Take a challenge out, once: DELETE … RETURNING means a replayed answer finds nothing. Bound to its purpose and (for
 * adding a passkey) to the account that asked, so one person's challenge cannot finish another's registration.
 */
async function claimChallenge(
  id: string,
  purpose: 'register' | 'sign_in',
  userId?: string,
): Promise<string | null> {
  const conds = [
    eq(webauthnChallenges.id, id),
    eq(webauthnChallenges.purpose, purpose),
    gt(webauthnChallenges.expiresAt, new Date()),
  ];
  if (userId) conds.push(eq(webauthnChallenges.userId, userId));
  const [row] = await getDb()
    .delete(webauthnChallenges)
    .where(and(...conds))
    .returning({ challenge: webauthnChallenges.challenge });
  return row?.challenge ?? null;
}

const EXPIRED = 'That took too long, or the passkey prompt was used already. Try again.';

// ─── adding one (signed in) ──────────────────────────────────────────────────────────────────────────────────────────

export async function passkeyRegistrationOptions(
  user: { id: string; handle: string },
  password: string,
): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  await confirmPassword(user.id, password);
  const db = getDb();
  const existing = await db
    .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
    .from(passkeys)
    .where(eq(passkeys.userId, user.id));
  if (existing.length >= MAX_PASSKEYS) {
    throw new AppError('CONFLICT', {
      message: `You have ${MAX_PASSKEYS} passkeys already. Remove one first.`,
    });
  }
  const { rpID, rpName } = relyingParty();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.handle,
    userDisplayName: `@${user.handle}`,
    // The account's own id (opaque, never shown); the same for every passkey of one account, as the spec asks.
    userID: new Uint8Array(Buffer.from(user.id.replace(/-/g, ''), 'hex')),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
    // Discoverable ("resident") so it can sign in with no handle typed; verification required (see the top).
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: ALGORITHMS,
    timeout: WEBAUTHN_CHALLENGE_TTL_MS,
  });
  return { challengeId: await newChallenge('register', options.challenge, user.id), options };
}

export async function addPasskey(
  user: { id: string },
  sessionId: string,
  input: { challengeId: string; response: RegistrationResponseJSON },
  ctx: { requestId: string; userAgent: string | null },
): Promise<{ recoveryCodes?: string[] }> {
  const challenge = await claimChallenge(input.challengeId, 'register', user.id);
  if (!challenge) throw new AppError('BAD_REQUEST', { message: EXPIRED });
  const { rpID, origin } = relyingParty();
  let verified;
  try {
    verified = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: ALGORITHMS,
    });
  } catch (err) {
    logger.warn({ event: 'passkey.register_rejected', requestId: ctx.requestId, err: String(err) });
    throw new AppError('BAD_REQUEST', { message: 'That passkey could not be added. Try again.' });
  }
  if (!verified.verified) throw new AppError('BAD_REQUEST', { message: 'That passkey could not be added.' });
  const { credential, credentialBackedUp } = verified.registrationInfo;

  const result = await getDb()
    .transaction(async (tx) => {
      // Re-count inside the transaction: two tabs racing must not get past the limit together.
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(passkeys)
        .where(eq(passkeys.userId, user.id));
      if (n >= MAX_PASSKEYS) return 'full' as const;
      await tx.insert(passkeys).values({
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        name: deviceLabel(ctx.userAgent),
        backedUp: credentialBackedUp,
      });
      return factorAddedIn(tx, user.id);
    })
    .catch((err: unknown) => {
      if (
        (err as { cause?: { code?: string } }).cause?.code === '23505' ||
        (err as { code?: string }).code === '23505'
      ) {
        throw new AppError('CONFLICT', { message: 'That passkey is already added.' });
      }
      throw err;
    });
  if (result === 'full') {
    throw new AppError('CONFLICT', {
      message: `You have ${MAX_PASSKEYS} passkeys already. Remove one first.`,
    });
  }
  await announceFactorAdded(user.id, sessionId, 'passkey_added', result.firstFactor, ctx);
  return result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {};
}

/** Remove one of MY passkeys. Someone else's id (or a made-up one) is the same 404: the owner is in the WHERE. */
export async function removePasskey(
  userId: string,
  passkeyId: string,
  password: string,
  ctx: { requestId: string },
): Promise<void> {
  await confirmPassword(userId, password);
  const result = await getDb().transaction(async (tx) => {
    const gone = await tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)))
      .returning({ id: passkeys.id });
    if (gone.length === 0) return null;
    return afterFactorRemoved(tx, userId);
  });
  if (!result) throw new AppError('NOT_FOUND');
  await announceFactorRemoved(userId, 'passkey_removed', result.lastFactor, ctx);
}

// ─── signing in with one (no handle, no password) ────────────────────────────────────────────────────────────────────

export async function passkeySignInOptions(
  ctx: RequestContext,
): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  await enforceRateLimit(`auth:passkey-options:ip:${ctx.ip}`, RATE.passkeyOptionsIp);
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    // Empty allow-list: the browser offers whichever passkey for this site the person has (no handle typed first,
    // so nothing here says whether an account exists).
    userVerification: 'required',
    timeout: WEBAUTHN_CHALLENGE_TTL_MS,
  });
  return { challengeId: await newChallenge('sign_in', options.challenge), options };
}

const UNKNOWN_PASSKEY = 'That passkey isn’t linked to a Howdy account. Sign in with your password instead.';

/**
 * Check a passkey's answer and return the account it proves (whatever its status: the caller decides what to say, the
 * same as after a password). Rate-limited like a password sign-in, per source and per passkey.
 */
export async function verifyPasskeySignIn(
  input: { challengeId: string; response: AuthenticationResponseJSON },
  ctx: RequestContext,
) {
  await enforceRateLimit(`auth:login:ip:${ctx.ip}`, RATE.loginIp);
  await enforceRateLimit(`auth:login:id:${keyDigest(`passkey:${input.response.id}`)}`, RATE.loginIdentifier);
  const challenge = await claimChallenge(input.challengeId, 'sign_in');
  if (!challenge) throw new AppError('UNAUTHENTICATED', { message: EXPIRED });

  const db = getDb();
  const [row] = await db
    .select({
      passkeyId: passkeys.id,
      publicKey: passkeys.publicKey,
      counter: passkeys.counter,
      transports: passkeys.transports,
      id: users.id,
      handle: users.handle,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(passkeys)
    .innerJoin(users, eq(users.id, passkeys.userId))
    .where(eq(passkeys.credentialId, input.response.id))
    .limit(1);
  if (!row)
    throw new AppError('UNAUTHENTICATED', { message: UNKNOWN_PASSKEY, data: { unknownPasskey: 'yes' } });

  const { rpID, origin } = relyingParty();
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: input.response.id,
        publicKey: new Uint8Array(row.publicKey),
        counter: row.counter,
        transports: row.transports,
      },
    });
  } catch (err) {
    logger.warn({ event: 'passkey.sign_in_rejected', requestId: ctx.requestId, err: String(err) });
    result = null;
  }
  if (!result?.verified) {
    await audit('passkey_sign_in_failed', { userId: row.id, requestId: ctx.requestId });
    throw new AppError('UNAUTHENTICATED', { message: 'That passkey did not work. Try again.' });
  }
  // A signature counter that does not move forward means a cloned authenticator (the library already refuses one that
  // goes backwards; synced passkeys always say 0 and are exempt). Written with a compare-and-set so the newer wins.
  const newCounter = result.authenticationInfo.newCounter;
  await db
    .update(passkeys)
    .set({
      counter: newCounter,
      lastUsedAt: new Date(),
      backedUp: result.authenticationInfo.credentialBackedUp,
    })
    .where(
      and(
        eq(passkeys.id, row.passkeyId),
        newCounter === 0 ? eq(passkeys.counter, 0) : lt(passkeys.counter, newCounter),
      ),
    );
  return { id: row.id, handle: row.handle, status: row.status, emailVerifiedAt: row.emailVerifiedAt };
}
