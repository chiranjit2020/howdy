import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { sessionCookieName } from './config';
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
  if (!user) redirect('/step-inside');
  return user;
}

export async function listMySessions(): Promise<SessionSummary[]> {
  const ctx = await getCurrentSession();
  return ctx ? listSessions(ctx.user.id, ctx.sessionId) : [];
}
