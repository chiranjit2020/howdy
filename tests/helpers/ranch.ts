import { GET as getMyRanch, PATCH as patchMyRanch } from '@/app/api/me/ranch/route';
import { DELETE as deleteSignal, PUT as putSignal } from '@/app/api/me/signal/route';
import { GET as getRanchRoute } from '@/app/api/ranch/[handle]/route';
import { getPool } from '@/platform/db';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

/** GET /api/ranch/:handle as a viewer (cookie) — anonymous when no cookie. */
export async function viewRanch(handle: string, opts: Opts = {}) {
  const res = await getRanchRoute(
    request('GET', `/api/ranch/${encodeURIComponent(handle)}`, undefined, opts),
    {
      params: Promise.resolve({ handle }),
    },
  );
  const text = await res.text();
  let data: {
    ranch?: Record<string, unknown>;
    error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  } = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { res, status: res.status, data, text };
}

export const myRanch = (cookie?: string) =>
  call(getMyRanch, 'GET', '/api/me/ranch', undefined, cookie ? { cookie } : {});
export const patchRanch = (body: unknown, opts: Opts = {}) =>
  call(patchMyRanch, 'PATCH', '/api/me/ranch', body, opts);
export const setSignal = (text: unknown, opts: Opts = {}) =>
  call(putSignal, 'PUT', '/api/me/signal', { text }, opts);
export const clearSignal = (opts: Opts = {}) =>
  call(deleteSignal, 'DELETE', '/api/me/signal', undefined, opts);

const pool = () => getPool();
export const sql = (q: string, args: unknown[] = []) => pool().query(q, args);
