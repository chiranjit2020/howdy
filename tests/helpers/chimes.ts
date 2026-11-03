import { GET as chimePrefsGet, PATCH as chimePrefsPatch } from '@/app/api/me/chime-prefs/route';
import { DELETE as chimeDelete, PATCH as chimePatch } from '@/app/api/me/chimes/[id]/route';
import { POST as seenRoute } from '@/app/api/me/chimes/seen/route';
import { POST as markReadRoute } from '@/app/api/me/chimes/read/route';
import { DELETE as clearRoute, GET as chimesRoute } from '@/app/api/me/chimes/route';
import { GET as unreadRoute } from '@/app/api/me/chimes/unread/route';
import { flushBackground } from '@/platform/background';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

export interface Chime {
  id: string;
  type: string;
  text: string;
  href: string;
  unread: boolean;
  actor: { handle: string; displayName: string };
}
export interface ChimeBody {
  chimes?: Chime[];
  nextCursor?: string | null;
  unread?: number;
  marked?: number;
  prefs?: Record<string, boolean>;
}

/** Events are handled after the response, so wait for them before looking. */
export async function chimesOf(opts: Opts, query = '') {
  await flushBackground();
  return call(chimesRoute, 'GET', `/api/me/chimes${query}`, undefined, opts) as Promise<{
    status: number;
    data: ChimeBody & { error?: { code: string } };
    text: string;
    res: Response;
  }>;
}

export const bell = async (opts: Opts): Promise<number> => {
  await flushBackground();
  const r = await call(unreadRoute, 'GET', '/api/me/chimes/unread', undefined, opts);
  return (r.data as { unread: number }).unread;
};

export const texts = async (opts: Opts): Promise<string[]> =>
  (await chimesOf(opts)).data.chimes!.map((c) => c.text);

export const types = async (opts: Opts): Promise<string[]> =>
  (await chimesOf(opts)).data.chimes!.map((c) => c.type);

export const markRead = async (body: unknown, opts: Opts) => {
  await flushBackground();
  return call(markReadRoute, 'POST', '/api/me/chimes/read', body, opts) as Promise<{
    status: number;
    data: ChimeBody & { error?: { code: string } };
  }>;
};

export const getPrefs = (opts: Opts) => call(chimePrefsGet, 'GET', '/api/me/chime-prefs', undefined, opts);
export const patchPrefs = (body: unknown, opts: Opts) =>
  call(chimePrefsPatch, 'PATCH', '/api/me/chime-prefs', body, opts);

/** "Clear all": DELETE /api/me/chimes. */
export const clearAll = async (body: unknown, opts: Opts) => {
  await flushBackground();
  return call(clearRoute, 'DELETE', '/api/me/chimes', body, opts) as Promise<{
    status: number;
    data: { cleared?: number; error?: { code: string } };
  }>;
};

/** POST /api/me/chimes/seen: what opening the page does (clears the bell, not the notifications). */
export const markSeen = async (body: unknown, opts: Opts) => {
  await flushBackground();
  return call(seenRoute, 'POST', '/api/me/chimes/seen', body, opts);
};

async function one(
  handler: (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  method: string,
  id: string,
  body: unknown,
  opts: Opts,
) {
  await flushBackground();
  const res = await handler(request(method, `/api/me/chimes/${encodeURIComponent(id)}`, body, opts), {
    params: Promise.resolve({ id }),
  });
  return { status: res.status };
}

/** PATCH /api/me/chimes/:id {read}. */
export const setRead = (id: string, read: unknown, opts: Opts) =>
  one(chimePatch, 'PATCH', id, { read }, opts);
/** DELETE /api/me/chimes/:id. */
export const removeOne = (id: string, opts: Opts) => one(chimeDelete, 'DELETE', id, undefined, opts);
