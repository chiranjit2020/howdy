import { GET as getRoute, POST as postRoute } from '@/app/api/ranch/[handle]/marks/route';
import { request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  counts?: Record<string, number>;
  total?: number;
  isOwner?: boolean;
  canGive?: boolean;
  cooldownEndsAt?: string | null;
  kind?: string;
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

/** GET /api/ranch/:handle/marks — the Vibe Matrix. */
export const marksOf = (handle: string, opts: Opts = {}) =>
  dynamic(getRoute, 'GET', `/api/ranch/${enc(handle)}/marks`, handle, undefined, opts);

/** POST /api/ranch/:handle/marks {kind}. */
export const giveMarkTo = (handle: string, kind: unknown, opts: Opts = {}) =>
  dynamic(postRoute, 'POST', `/api/ranch/${enc(handle)}/marks`, handle, { kind }, opts);
