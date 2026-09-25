import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { users } from '@db/schema';
import { getEnv } from '@/platform/config/env';
import { getDb } from '@/platform/db';
import { createSession } from '@/modules/auth/sessions';
import { sessionCookie } from '@/modules/auth/request';

/** DEV ONLY: signs in the seeded demo_rider user and redirects to /home. 404s in production. */
export async function GET() {
  if (getEnv().NODE_ENV === 'production') return new NextResponse(null, { status: 404 });

  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.handle, 'demo_rider')).limit(1);
  if (!user) return new NextResponse(null, { status: 404 });

  const session = await createSession(user.id, 'dev-login');
  const res = NextResponse.redirect(new URL('/home', getEnv().APP_URL));
  res.headers.append('Set-Cookie', sessionCookie(session.token, session.maxAgeSec));
  return res;
}
