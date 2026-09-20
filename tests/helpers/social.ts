import { GET as getMine } from '@/app/api/me/relationships/route';
import { GET as getRel, POST as postRel } from '@/app/api/relationships/[handle]/route';
import { POST as postReport } from '@/app/api/reports/route';
import { getPool } from '@/platform/db';
import type { RelationshipAction } from '@/shared/validation/relationships';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  relationship?: Record<string, unknown>;
  person?: Record<string, unknown>;
  error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  [k: string]: unknown;
};

async function dynamic(
  handler: (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  method: string,
  path: string,
  handle: string,
  body: unknown,
  opts: Opts,
) {
  const res = await handler(request(method, path, body, opts), { params: Promise.resolve({ handle }) });
  const text = await res.text();
  let data: Wire = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { res, status: res.status, data, text };
}

/** GET /api/relationships/:handle — my relationship with someone. */
export const relWith = (handle: string, opts: Opts = {}) =>
  dynamic(getRel, 'GET', `/api/relationships/${encodeURIComponent(handle)}`, handle, undefined, opts);

/** POST /api/relationships/:handle {action}. */
export const doAct = (handle: string, action: unknown, opts: Opts = {}) =>
  dynamic(postRel, 'POST', `/api/relationships/${encodeURIComponent(handle)}`, handle, { action }, opts);

/** GET /api/me/relationships. */
export const myLists = (opts: Opts = {}) => call(getMine, 'GET', '/api/me/relationships', undefined, opts);

/** POST /api/reports. */
export const report = (body: unknown, opts: Opts = {}) =>
  call(postReport, 'POST', '/api/reports', body, opts);

export const q = (sql: string, args: unknown[] = []) => getPool().query(sql, args);

let n = 0;
/**
 * Insert an already-verified user directly (no Argon2, no email) for tests that need MANY people cheaply. They have no
 * usable password, so they cannot sign in — they are only ever targets.
 */
export async function insertUser(prefix = 'bulk'): Promise<{ id: string; handle: string }> {
  n += 1;
  const handle = `${prefix}${Date.now().toString(36)}${n}`.slice(0, 24);
  const { rows } = await q(
    'insert into users (email, handle, email_verified_at) values ($1, $2, now()) returning id',
    [`${handle}@example.com`, handle],
  );
  const id = rows[0].id as string;
  await q('insert into profiles (user_id, display_name) values ($1, $2)', [id, handle]);
  return { id, handle };
}

export const userId = async (handle: string) =>
  (await q('select id from users where handle = $1', [handle])).rows[0].id as string;

/** The relationship view with everything false, for "this is exactly what an ordinary result looks like" comparisons. */
export const NONE = {
  posse: 'none',
  closeByMe: false,
  scouting: false,
  muted: false,
  restricted: false,
  blocked: false,
};

export type { RelationshipAction };
