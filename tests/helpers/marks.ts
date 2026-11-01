import {
  DELETE as deleteRoute,
  GET as getRoute,
  POST as postRoute,
} from '@/app/api/porch/[handle]/marks/route';
import { request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  words?: string[];
  isOwner?: boolean;
  canGive?: boolean;
  mine?: string | null;
  kind?: string;
  removed?: boolean;
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

const enc = encodeURIComponent;

/** GET /api/porch/:handle/marks — how they are described (top words, my pick). */
export const marksOf = (handle: string, opts: Opts = {}) =>
  dynamic(getRoute, 'GET', `/api/porch/${enc(handle)}/marks`, handle, undefined, opts);

/** POST /api/porch/:handle/marks {kind}: pick (or change) my word for them. */
export const giveMarkTo = (handle: string, kind: unknown, opts: Opts = {}) =>
  dynamic(postRoute, 'POST', `/api/porch/${enc(handle)}/marks`, handle, { kind }, opts);

/** DELETE /api/porch/:handle/marks: take my word back. */
export const takeBackMark = (handle: string, opts: Opts = {}) =>
  dynamic(deleteRoute, 'DELETE', `/api/porch/${enc(handle)}/marks`, handle, undefined, opts);
