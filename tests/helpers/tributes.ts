import { POST as approveRoute } from '@/app/api/tributes/[id]/approve/route';
import { DELETE as deleteRoute, PATCH as patchRoute } from '@/app/api/tributes/[id]/route';
import { GET as waitingRoute } from '@/app/api/me/tributes/waiting/route';
import { GET as getRoute, POST as postRoute } from '@/app/api/ranch/[handle]/tributes/route';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  tribute?: Tribute;
  tributes?: Tribute[];
  waiting?: Tribute[];
  nextCursor?: string | null;
  canGive?: boolean;
  isOwner?: boolean;
  error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  [k: string]: unknown;
};
export interface Tribute {
  id: string;
  body: string;
  mine: boolean;
  waiting: boolean;
  pinned: boolean;
  canRemove: boolean;
  author: { handle: string };
}

async function dynamic(
  handler: (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  method: string,
  path: string,
  params: Record<string, string>,
  body: unknown,
  opts: Opts,
) {
  const res = await handler(request(method, path, body, opts), { params: Promise.resolve(params) });
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

/** GET /api/ranch/:handle/tributes[?query]. */
export const tributesOf = (handle: string, opts: Opts = {}, query = '') =>
  dynamic(getRoute, 'GET', `/api/ranch/${enc(handle)}/tributes${query}`, { handle }, undefined, opts);

/** POST /api/ranch/:handle/tributes {body}. */
export const leaveTribute = (handle: string, body: unknown, opts: Opts = {}) =>
  dynamic(postRoute, 'POST', `/api/ranch/${enc(handle)}/tributes`, { handle }, body, opts);

export const approveTributeOf = (id: string, opts: Opts = {}) =>
  dynamic(approveRoute, 'POST', `/api/tributes/${enc(id)}/approve`, { id }, {}, opts);

export const pinTributeOf = (id: string, pinned: boolean, opts: Opts = {}) =>
  dynamic(patchRoute, 'PATCH', `/api/tributes/${enc(id)}`, { id }, { pinned }, opts);

export const removeTributeOf = (id: string, opts: Opts = {}) =>
  dynamic(deleteRoute, 'DELETE', `/api/tributes/${enc(id)}`, { id }, undefined, opts);

export const waitingTributes = (opts: Opts = {}) =>
  call(waitingRoute, 'GET', '/api/me/tributes/waiting', undefined, opts);
