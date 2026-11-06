import { createHash, randomBytes } from 'node:crypto';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { parseCookies, serializeCookie } from '@/platform/http/cookies';
import { logger } from '@/platform/logger';
import { enforceRateLimit } from '@/platform/rate-limit';
import { emailSchema } from '@/shared/validation/auth';
import type { RequestContext } from './accounts';
import { claimAccountForGoogle } from './accounts';
import { RATE, isSecureDeployment } from './config';
import { openPayload, sealPayload } from './factor-crypto';

/**
 * "Continue with Google" (ADR-048): OpenID Connect authorization-code flow with PKCE, a `state` and a `nonce`, no
 * library. Google only ever proves an email; everything after that (two-step, suspension, closing, the session itself)
 * runs through the same sign-in code as a password.
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Between the redirect to Google and its answer. */
const FLOW_TTL_MS = 10 * 60_000;
/** Google proved an existing account: long enough to type a two-step code. */
const PROVEN_TTL_MS = 10 * 60_000;
/** A new person filling in their username. */
const SIGNUP_TTL_MS = 30 * 60_000;

const FLOW = 'google-flow';
const PROVEN = 'google-proven';
const SIGNUP = 'google-signup';
const CONFIRMED = 'google-confirmed';

/**
 * How long "I just confirmed it's me with Google" lasts (see startGoogleConfirm): long enough to download the data or
 * change a few sign-in settings in one go, short enough that a phone left signed in an hour later is not enough.
 */
export const CONFIRM_TTL_MS = 10 * 60_000;
/** Google must say the person signed in again at most this long ago (its `auth_time`), when it says at all. */
const CONFIRM_MAX_AUTH_AGE_MS = 10 * 60_000;

export function googleEnabled(): boolean {
  const env = getEnv();
  return !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
}

const cookieName = (label: string) => (isSecureDeployment() ? `__Host-howdy_${label}` : `howdy_${label}`);

/** HttpOnly, SameSite=Lax (sent on the top-level GET back from Google), site-wide, short. */
function cookie(label: string, value: string, maxAgeMs: number): string {
  return serializeCookie(cookieName(label), value, {
    maxAgeSec: Math.floor(maxAgeMs / 1000),
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: 'Lax',
    path: '/',
  });
}
export const clearedGoogleCookie = (label: 'proven' | 'signup' | 'flow' | 'confirmed') =>
  cookie({ proven: PROVEN, signup: SIGNUP, flow: FLOW, confirmed: CONFIRMED }[label], '', 0);

const redirectUri = () => new URL('/api/auth/google/callback', getEnv().APP_URL).toString();

interface Flow {
  state: string;
  verifier: string;
  nonce: string;
  remember: boolean;
  invite: string | null;
  /** Set when this is "confirm it's you" for someone already signed in (startGoogleConfirm), not a sign-in. */
  confirm?: { userId: string; sessionId: string; next: string };
}

function newFlow(extra: Pick<Flow, 'remember' | 'invite' | 'confirm'>): Flow {
  return {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    ...extra,
  };
}

function authorizeUrl(flow: Flow, extra: Record<string, string>): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: getEnv().GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    ...extra,
  }).toString();
  return url.toString();
}

/** The redirect to Google, and the cookie that remembers what we asked for. */
export function startGoogle(opts: { remember: boolean; invite: string | null }): {
  location: string;
  setCookie: string;
} {
  if (!getEnv().GOOGLE_CLIENT_ID) throw new AppError('NOT_FOUND');
  const flow = newFlow({ remember: opts.remember, invite: opts.invite });
  return {
    location: authorizeUrl(flow, { prompt: 'select_account' }),
    setCookie: cookie(FLOW, sealPayload(FLOW, flow, FLOW_TTL_MS), FLOW_TTL_MS),
  };
}

/**
 * "Confirm it's you" for someone signed in who has no password (they joined with Google): downloading their data,
 * closing the account and changing sign-in security ask for the password again, and this is their way to answer.
 * Google is asked to make them sign in again (`prompt=login`, `max_age=0`), on the account with this address
 * (`login_hint`); the answer comes back to the same callback, which then leaves a short-lived proof for THIS session.
 */
export function startGoogleConfirm(
  session: { sessionId: string; user: { id: string; email: string } },
  next: string,
): { location: string; setCookie: string } {
  if (!getEnv().GOOGLE_CLIENT_ID) throw new AppError('NOT_FOUND');
  const flow = newFlow({
    remember: false,
    invite: null,
    confirm: { userId: session.user.id, sessionId: session.sessionId, next },
  });
  return {
    location: authorizeUrl(flow, { prompt: 'login', max_age: '0', login_hint: session.user.email }),
    setCookie: cookie(FLOW, sealPayload(FLOW, flow, FLOW_TTL_MS), FLOW_TTL_MS),
  };
}

/** Where a "confirm it's you" round trip should land, read from the flow cookie (null for an ordinary sign-in). */
export function googleConfirmNext(req: Request): string | null {
  const flow = openPayload<Flow>(FLOW, parseCookies(req.headers.get('cookie')).get(cookieName(FLOW)));
  return flow?.confirm?.next ?? null;
}

/**
 * Has THIS session confirmed with Google in the last CONFIRM_TTL_MS? The proof is sealed (it cannot be forged or
 * edited) and names the session and the person, so it is useless on any other session, even the same person's.
 */
export function googleConfirmedFor(
  cookieHeader: string | null,
  session: { sessionId: string; user: { id: string } },
): boolean {
  const proof = openPayload<{ userId: string; sessionId: string }>(
    CONFIRMED,
    parseCookies(cookieHeader).get(cookieName(CONFIRMED)),
  );
  return proof?.userId === session.user.id && proof.sessionId === session.sessionId;
}

export type GoogleOutcome =
  /** Existing account: the login endpoint finishes (two-step, suspension …) using this cookie. */
  | { kind: 'existing'; setCookie: string; remember: boolean }
  /** "Confirm it's you" passed: this cookie is the proof, and `next` is where to go back to. */
  | { kind: 'confirmed'; setCookie: string; next: string }
  /** New person: the "choose a username" step uses this cookie. */
  | { kind: 'new'; setCookie: string };

/** What Google said, checked. Throws AppError('UNAUTHENTICATED') for anything off. */
export async function finishGoogle(
  req: Request,
  ctx: RequestContext,
  /** The signed-in session, if any (only a "confirm it's you" round trip needs it). */
  session?: { sessionId: string; user: { id: string; email: string } } | null,
): Promise<GoogleOutcome> {
  await enforceRateLimit(`auth:google:ip:${ctx.ip}`, RATE.googleIp);
  const env = getEnv();
  const params = new URL(req.url).searchParams;
  const flow = openPayload<Flow>(FLOW, parseCookies(req.headers.get('cookie')).get(cookieName(FLOW)));
  const fail = (why: string) => {
    logger.warn({ event: 'auth.google_failed', requestId: ctx.requestId, why });
    return new AppError('UNAUTHENTICATED', { message: 'Google sign-in did not finish. Please try again.' });
  };
  if (params.get('error')) throw fail(`google:${params.get('error')}`.slice(0, 60));
  const code = params.get('code');
  if (!flow || !code || params.get('state') !== flow.state) throw fail('state');

  // Straight to Google over TLS, so the ID token in the answer can be trusted without checking its signature
  // (OpenID Connect Core 3.1.3.7, step 6). Its claims are still checked below.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!res?.ok) throw fail(`token:${res?.status ?? 'network'}`);
  const { id_token: idToken } = (await res.json().catch(() => ({}))) as { id_token?: unknown };
  const claims = typeof idToken === 'string' ? decodeClaims(idToken) : null;
  if (!claims) throw fail('id_token');
  if (!ISSUERS.has(String(claims.iss))) throw fail('iss');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw fail('aud');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw fail('exp');
  if (claims.nonce !== flow.nonce) throw fail('nonce');
  if (claims.email_verified !== true) throw fail('email_unverified');
  const email = emailSchema.safeParse(claims.email);
  if (!email.success) throw fail('email');
  if (!googleIsAuthoritative(email.data, claims.hd)) {
    logger.warn({ event: 'auth.google_failed', requestId: ctx.requestId, why: 'not_authoritative' });
    throw new AppError('UNAUTHENTICATED', { data: { reason: NOT_AUTHORITATIVE } });
  }

  if (flow.confirm) {
    // Still the same person on the same session that asked, and Google proved THEIR address, just now.
    if (!session || session.user.id !== flow.confirm.userId || session.sessionId !== flow.confirm.sessionId) {
      throw fail('confirm_session');
    }
    if (email.data !== session.user.email.toLowerCase()) {
      logger.warn({ event: 'auth.google_failed', requestId: ctx.requestId, why: 'confirm_other_account' });
      throw new AppError('UNAUTHENTICATED', { data: { reason: OTHER_ACCOUNT } });
    }
    if (
      typeof claims.auth_time === 'number' &&
      Date.now() - claims.auth_time * 1000 > CONFIRM_MAX_AUTH_AGE_MS
    ) {
      throw fail('confirm_stale');
    }
    return {
      kind: 'confirmed',
      next: flow.confirm.next,
      setCookie: cookie(
        CONFIRMED,
        sealPayload(CONFIRMED, { userId: session.user.id, sessionId: session.sessionId }, CONFIRM_TTL_MS),
        CONFIRM_TTL_MS,
      ),
    };
  }

  const userId = await claimAccountForGoogle(email.data, ctx);
  if (userId) {
    return {
      kind: 'existing',
      remember: flow.remember,
      setCookie: cookie(
        PROVEN,
        sealPayload(PROVEN, { userId, remember: flow.remember }, PROVEN_TTL_MS),
        PROVEN_TTL_MS,
      ),
    };
  }
  const name = typeof claims.name === 'string' ? claims.name.slice(0, 80) : null;
  return {
    kind: 'new',
    setCookie: cookie(
      SIGNUP,
      sealPayload(SIGNUP, { email: email.data, name, invite: flow.invite }, SIGNUP_TTL_MS),
      SIGNUP_TTL_MS,
    ),
  };
}

/** Why Google could not be used: the address is one Google does not control (see googleIsAuthoritative). */
export const NOT_AUTHORITATIVE = 'not_authoritative';
/** "Confirm it's you" was answered with a different Google account from the one this Howdy account uses. */
export const OTHER_ACCOUNT = 'other_account';

/**
 * Does Google itself control this address, so that "verified" means "owns it NOW"? Only for Gmail, and for a Google
 * Workspace domain (the `hd` claim, which must be the address's own domain). Any other address on a Google account
 * was checked once, maybe years ago: a former employee or a domain's previous owner can still hold that Google
 * account. Google's own guidance is to rely on the email only in these two cases (security audit 2026-10-29, finding
 * 2). For anything else Howdy refuses Google outright, for new accounts too: otherwise a stale Google login could make
 * an account under someone else's email and lock its real owner out. Those people sign up with email (and a code).
 */
export function googleIsAuthoritative(email: string, hd: unknown): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') return true;
  return typeof hd === 'string' && hd.toLowerCase() === domain;
}

function decodeClaims(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The account Google proved, from the cookie the callback set (for the login endpoint). */
export function provenByGoogle(cookieHeader: string | null): { userId: string; remember: boolean } | null {
  return openPayload(PROVEN, parseCookies(cookieHeader).get(cookieName(PROVEN)));
}

export interface GoogleSignup {
  email: string;
  name: string | null;
  invite: string | null;
}

/** The new person Google introduced, from the cookie the callback set (for "choose a username"). */
export function pendingGoogleSignup(cookieValue: string | undefined): GoogleSignup | null {
  return openPayload<GoogleSignup>(SIGNUP, cookieValue);
}
export const googleSignupCookieName = () => cookieName(SIGNUP);
