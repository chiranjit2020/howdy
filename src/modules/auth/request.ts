import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { clientIp } from '@/platform/http/client-ip';
import { parseCookies, serializeCookie } from '@/platform/http/cookies';
import type { RequestContext } from './accounts';
import { isSecureDeployment, sessionCookieName } from './config';
import { validateSession, type SessionContext } from './sessions';

export function sessionTokenFrom(headers: Headers): string | undefined {
  return parseCookies(headers.get('cookie')).get(sessionCookieName());
}

/** The session cookie: HttpOnly (no JS access), Secure + __Host- prefix on https, SameSite=Lax, site-wide path. */
export function sessionCookie(token: string, maxAgeSec: number): string {
  return serializeCookie(sessionCookieName(), token, {
    maxAgeSec,
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: 'Lax',
    path: '/',
  });
}

/** Expire the cookie in the browser. */
export function clearedSessionCookie(): string {
  return serializeCookie(sessionCookieName(), '', {
    maxAgeSec: 0,
    httpOnly: true,
    secure: isSecureDeployment(),
    sameSite: 'Lax',
    path: '/',
  });
}

export function requestContext(req: Request, requestId: string): RequestContext {
  return { requestId, ip: clientIp(req.headers, getEnv().TRUST_PROXY_HOPS) };
}

/** The caller's live session, or null when signed out. For endpoints that behave differently per viewer. */
export async function optionalSession(req: Request): Promise<SessionContext | null> {
  const token = sessionTokenFrom(req.headers);
  return token ? validateSession(token) : null;
}

/** Resolve the caller's live session or throw UNAUTHENTICATED. */
export async function requireSession(req: Request): Promise<SessionContext> {
  const token = sessionTokenFrom(req.headers);
  const ctx = token ? await validateSession(token) : null;
  if (!ctx) throw new AppError('UNAUTHENTICATED');
  return ctx;
}
