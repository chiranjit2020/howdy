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
export const clearedGoogleCookie = (label: 'proven' | 'signup' | 'flow') =>
  cookie({ proven: PROVEN, signup: SIGNUP, flow: FLOW }[label], '', 0);

const redirectUri = () => new URL('/api/auth/google/callback', getEnv().APP_URL).toString();

interface Flow {
  state: string;
  verifier: string;
  nonce: string;
  remember: boolean;
  invite: string | null;
}

/** The redirect to Google, and the cookie that remembers what we asked for. */
export function startGoogle(opts: { remember: boolean; invite: string | null }): {
  location: string;
  setCookie: string;
} {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID) throw new AppError('NOT_FOUND');
  const flow: Flow = {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(48).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    remember: opts.remember,
    invite: opts.invite,
  };
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return {
    location: url.toString(),
    setCookie: cookie(FLOW, sealPayload(FLOW, flow, FLOW_TTL_MS), FLOW_TTL_MS),
  };
}

export type GoogleOutcome =
  /** Existing account: the login endpoint finishes (two-step, suspension …) using this cookie. */
  | { kind: 'existing'; setCookie: string; remember: boolean }
  /** New person: the "choose a username" step uses this cookie. */
  | { kind: 'new'; setCookie: string };

/** What Google said, checked. Throws AppError('UNAUTHENTICATED') for anything off. */
export async function finishGoogle(req: Request, ctx: RequestContext): Promise<GoogleOutcome> {
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
