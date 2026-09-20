import { randomUUID } from 'node:crypto';
import { GET as threadsRoute } from '@/app/api/whispers/route';
import {
  GET as threadRoute,
  POST as sendRoute,
  DELETE as burnRoute,
} from '@/app/api/whispers/[handle]/route';
import { POST as readRoute } from '@/app/api/whispers/[handle]/read/route';
import { GET as unreadRoute } from '@/app/api/whispers/unread/route';
import { flushBackground } from '@/platform/background';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

export interface Msg {
  id: string;
  seq: number;
  clientId: string;
  body: string;
  mine: boolean;
  createdAt: string;
}
export interface Thread {
  handle: string;
  displayName: string;
  last: { body: string; mine: boolean; at: string };
  unread: number;
  muted: boolean;
}
interface Wire {
  messages?: Msg[];
  message?: Msg;
  person?: { handle: string; displayName: string };
  hasMore?: boolean;
  threads?: Thread[];
  unread?: number;
  burned?: number;
  readUpTo?: number;
  error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  [k: string]: unknown;
}

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
const enc = encodeURIComponent;

export const newId = () => randomUUID();

/** GET /api/whispers/:handle[?query] — events run after the response, so let them finish first. */
export const threadOf = async (handle: string, opts: Opts = {}, query = '') => {
  await flushBackground();
  return dynamic(threadRoute, 'GET', `/api/whispers/${enc(handle)}${query}`, handle, undefined, opts);
};

/** POST /api/whispers/:handle {clientId, body}. */
export const whisper = (handle: string, body: unknown, opts: Opts = {}, clientId: unknown = newId()) =>
  dynamic(sendRoute, 'POST', `/api/whispers/${enc(handle)}`, handle, { clientId, body }, opts);

/** POST with a raw body object (for validation / mass-assignment tests). */
export const whisperRaw = (handle: string, payload: unknown, opts: Opts = {}) =>
  dynamic(sendRoute, 'POST', `/api/whispers/${enc(handle)}`, handle, payload, opts);

export const readTo = (handle: string, upTo: unknown, opts: Opts = {}) =>
  dynamic(readRoute, 'POST', `/api/whispers/${enc(handle)}/read`, handle, { upTo }, opts);

export const burn = (handle: string, opts: Opts = {}) =>
  dynamic(burnRoute, 'DELETE', `/api/whispers/${enc(handle)}`, handle, undefined, opts);

export const threads = async (opts: Opts = {}) => {
  await flushBackground();
  return call(threadsRoute, 'GET', '/api/whispers', undefined, opts) as Promise<{
    status: number;
    data: Wire;
    text: string;
    res: Response;
  }>;
};

export const whisperBell = async (opts: Opts = {}): Promise<number> => {
  await flushBackground();
  return (
    (await call(unreadRoute, 'GET', '/api/whispers/unread', undefined, opts)).data as { unread: number }
  ).unread;
};

export const bodies = async (handle: string, opts: Opts = {}): Promise<string[]> =>
  (await threadOf(handle, opts)).data.messages!.map((m) => m.body);
