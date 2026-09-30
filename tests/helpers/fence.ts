import { POST as approveCardRoute } from '@/app/api/cards/[id]/approve/route';
import { POST as replyRoute } from '@/app/api/cards/[id]/replies/route';
import { POST as reportCardRoute } from '@/app/api/cards/[id]/report/route';
import { DELETE as deleteCardRoute } from '@/app/api/cards/[id]/route';
import { POST as yoRoute } from '@/app/api/cards/[id]/yo/route';
import { GET as waitingRoute } from '@/app/api/me/fence/waiting/route';
import { GET as getFenceRoute, POST as postFenceRoute } from '@/app/api/porch/[handle]/fence/route';
import { POST as approveReplyRoute } from '@/app/api/replies/[id]/approve/route';
import { DELETE as deleteReplyRoute } from '@/app/api/replies/[id]/route';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  cards?: Card[];
  card?: Card;
  reply?: Reply;
  nextCursor?: string | null;
  canPost?: boolean;
  isOwner?: boolean;
  review?: boolean;
  yoByMe?: boolean;
  myReaction?: string | null;
  error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  [k: string]: unknown;
};
export interface Reply {
  id: string;
  body: string;
  mine: boolean;
  waiting: boolean;
  canRemove: boolean;
  author: { handle: string };
}
export interface Card {
  id: string;
  body: string;
  mine: boolean;
  waiting: boolean;
  canRemove: boolean;
  canYo: boolean;
  canReply: boolean;
  yoCount: number;
  yoByMe: boolean;
  reactions: Record<string, number>;
  myReaction: string | null;
  replies: Reply[];
  author: { handle: string; displayName: string };
  photo: { url: string; width: number; height: number } | null;
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

/** GET /api/porch/:handle/fence[?query]. */
export const fenceOf = (handle: string, opts: Opts = {}, query = '') =>
  dynamic(getFenceRoute, 'GET', `/api/porch/${enc(handle)}/fence${query}`, { handle }, undefined, opts);

/** POST /api/porch/:handle/fence {body}. */
export const nail = (handle: string, body: unknown, opts: Opts = {}) =>
  dynamic(postFenceRoute, 'POST', `/api/porch/${enc(handle)}/fence`, { handle }, body, opts);

export const replyTo = (cardId: string, body: unknown, opts: Opts = {}) =>
  dynamic(replyRoute, 'POST', `/api/cards/${enc(cardId)}/replies`, { id: cardId }, body, opts);

export const yo = (cardId: string, on: unknown, opts: Opts = {}, kind?: unknown) =>
  dynamic(
    yoRoute,
    'POST',
    `/api/cards/${enc(cardId)}/yo`,
    { id: cardId },
    kind === undefined ? { on } : { on, kind },
    opts,
  );

export const scrape = (cardId: string, opts: Opts = {}) =>
  dynamic(deleteCardRoute, 'DELETE', `/api/cards/${enc(cardId)}`, { id: cardId }, undefined, opts);

export const approve = (cardId: string, opts: Opts = {}) =>
  dynamic(approveCardRoute, 'POST', `/api/cards/${enc(cardId)}/approve`, { id: cardId }, {}, opts);

export const flagCard = (cardId: string, body: unknown, opts: Opts = {}) =>
  dynamic(reportCardRoute, 'POST', `/api/cards/${enc(cardId)}/report`, { id: cardId }, body, opts);

export const removeReplyOf = (replyId: string, opts: Opts = {}) =>
  dynamic(deleteReplyRoute, 'DELETE', `/api/replies/${enc(replyId)}`, { id: replyId }, undefined, opts);

export const approveReplyOf = (replyId: string, opts: Opts = {}) =>
  dynamic(approveReplyRoute, 'POST', `/api/replies/${enc(replyId)}/approve`, { id: replyId }, {}, opts);

export const waiting = (opts: Opts = {}) =>
  call(waitingRoute, 'GET', '/api/me/fence/waiting', undefined, opts);

/** Read every page of a Fence and return the card bodies in order. */
export async function allBodies(handle: string, opts: Opts = {}, limit = 20): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | null | undefined;
  for (let i = 0; i < 100; i++) {
    const r = await fenceOf(handle, opts, `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
    if (r.status !== 200) throw new Error(`fence read failed: ${r.text}`);
    out.push(...r.data.cards!.map((c) => c.body));
    cursor = r.data.nextCursor;
    if (!cursor) return out;
  }
  throw new Error('paging did not terminate');
}
