import { auditLog, emailTokens, sessions, users } from '@db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { flushBackground } from '@/platform/background';
import { getDb } from '@/platform/db';
import { AppError } from '@/platform/errors';
import { MemoryMailer, setMailer } from '@/platform/mailer';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { authHandlers } from '@/modules/auth';
import { sessionCookieName } from '@/modules/auth/config';
import { hashToken } from '@/modules/auth/crypto';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct horse battery staple';

interface CallOpts {
  cookie?: string;
  ip?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  contentType?: string | null;
  rawBody?: string;
}

/** Build a same-origin JSON request the way a browser would send it. */
export function request(method: string, path: string, body?: unknown, opts: CallOpts = {}): Request {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.contentType !== null) headers['content-type'] = opts.contentType ?? 'application/json';
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip; // TRUST_PROXY_HOPS=1 in tests
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') init.body = opts.rawBody ?? JSON.stringify(body ?? {});
  return new Request(`${ORIGIN}${path}`, init);
}

export type Handler = (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(
  handler: Handler,
  method: string,
  path: string,
  body?: unknown,
  opts: CallOpts = {},
) {
  const res = await handler(request(method, path, body, opts));
  const text = await res.text();
  let data: {
    error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
    [k: string]: unknown;
  } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { res, status: res.status, data, text };
}

/** Response body with volatile request ids removed, for "these two responses are identical" assertions. */
export function stable(data: object): string {
  return JSON.stringify(data, (k, v) => (k === 'requestId' ? undefined : v));
}

/** `name=value` pair from a Set-Cookie header, ready to send back as a Cookie header. */
export function cookieFrom(res: Response): string | undefined {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith(`${sessionCookieName()}=`));
  if (!raw) return undefined;
  const pair = raw.split(';')[0]!;
  return pair.endsWith('=') ? undefined : pair;
}

export const tokenFrom = (mailText: string): string => {
  const m = /[?&]token=([A-Za-z0-9_-]{43})/.exec(mailText);
  if (!m) throw new Error('no token link in mail');
  return m[1]!;
};

export interface TestKit {
  mailer: MemoryMailer;
}

/** Fresh DB rows, mailer and rate limiter. Call in beforeEach. */
export async function freshAuthState(): Promise<TestKit> {
  await flushBackground();
  await getDb().execute(
    sql`truncate table audit_log, email_tokens, sessions, credentials, retired_handles, users restart identity cascade`,
  );
  const mailer = new MemoryMailer();
  setMailer(mailer);
  setRateLimiter(new MemoryRateLimiter());
  return { mailer };
}

let counter = 0;
export const uniqueUser = (prefix = 'user') => {
  counter += 1;
  return {
    email: `${prefix}${counter}@example.com`,
    handle: `${prefix}${counter}`,
    password: PASSWORD,
    acceptTerms: true as const,
  };
};

export async function signUpUser(kit: TestKit, u = uniqueUser(), opts: CallOpts = {}) {
  const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', u, opts);
  await flushBackground();
  return { ...u, response: r };
}

/** Sign up and confirm the email, returning credentials. */
export async function verifiedUser(kit: TestKit, u = uniqueUser()) {
  const created = await signUpUser(kit, u);
  if (created.response.status !== 202) throw new Error(`signup failed: ${created.response.text}`);
  const mail = kit.mailer.lastTo(u.email);
  if (!mail) throw new Error('no verification mail');
  const v = await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', {
    token: tokenFrom(mail.text),
  });
  if (v.status !== 200) throw new Error(`verify failed: ${v.text}`);
  return u;
}

export async function loginAs(u: { email: string; password: string }, opts: CallOpts = {}) {
  const r = await call(
    authHandlers.login,
    'POST',
    '/api/auth/login',
    { identifier: u.email, password: u.password },
    opts,
  );
  return { ...r, cookie: cookieFrom(r.res) };
}

/** Sign up, verify and log in in one go. */
export async function signedInUser(kit: TestKit, u = uniqueUser(), opts: CallOpts = {}) {
  await verifiedUser(kit, u);
  const l = await loginAs(u, opts);
  if (!l.cookie) throw new Error(`login failed: ${l.text}`);
  return { ...u, cookie: l.cookie };
}

/**
 * Sign up, verify and log in, then move the account's creation date back a month. Use it where a test is about
 * everyone's rules, so the tighter first-week budgets (ADR-024) do not trip first.
 */
export async function settledUser(kit: TestKit, u = uniqueUser(), opts: CallOpts = {}) {
  const p = await signedInUser(kit, u, opts);
  await getDb()
    .update(users)
    .set({ createdAt: sql`now() - interval '30 days'` })
    .where(eq(users.email, u.email));
  return p;
}

export const me = (cookie?: string) =>
  call(authHandlers.me, 'GET', '/api/auth/me', undefined, cookie ? { cookie } : {});

// ─── direct DB access for assertions / time travel ───────────────────────────
export const db = () => getDb();
export const userByEmail = async (email: string) =>
  (await getDb().select().from(users).where(eq(users.email, email)))[0];
export const sessionRows = (userId: string) =>
  getDb().select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt));
export const tokenRows = (userId: string) =>
  getDb().select().from(emailTokens).where(eq(emailTokens.userId, userId));
export const auditEvents = async (userId?: string) =>
  (userId
    ? await getDb().select().from(auditLog).where(eq(auditLog.userId, userId))
    : await getDb().select().from(auditLog)
  ).map((r) => r.event);
export const tokenHashOf = hashToken;

export function expectAppError(err: unknown, code: string) {
  if (!(err instanceof AppError) || err.code !== code)
    throw new Error(`expected AppError ${code}, got ${String(err)}`);
}
