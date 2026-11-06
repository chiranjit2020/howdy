import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sessionCookieName } from './config';
import { googleConfirmedFor } from './google';
import { hasPassword } from './no-password';
import {
  listSessions,
  validateSession,
  type SessionContext,
  type SessionSummary,
  type SessionUser,
} from './sessions';

/** The live session for this request (deduplicated within a render), or null. Server Components only. */
export const getCurrentSession = cache(async (): Promise<SessionContext | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token ? validateSession(token) : null;
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getCurrentSession())?.user ?? null;
}

/** Protected pages call this: unauthenticated visitors are sent to Step Inside. The check is server-side. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function listMySessions(): Promise<SessionSummary[]> {
  const ctx = await getCurrentSession();
  return ctx ? listSessions(ctx.user.id, ctx.sessionId) : [];
}

/**
 * For Settings: how this person proves it's them again. With a password they type it; without one (they joined with
 * Google) they confirm with Google, and `googleConfirmed` says whether THIS session did so in the last few minutes.
 */
export async function identityCheckFor(): Promise<{ hasPassword: boolean; googleConfirmed: boolean }> {
  const session = await getCurrentSession();
  if (!session) return { hasPassword: true, googleConfirmed: false };
  const store = await cookies();
  const cookieHeader = store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  return {
    hasPassword: await hasPassword(session.user.id),
    googleConfirmed: googleConfirmedFor(cookieHeader, session),
  };
}
