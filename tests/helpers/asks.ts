import { GET as listRoute, POST as createRoute } from '@/app/api/asks/route';
import { DELETE as removeRoute } from '@/app/api/asks/[id]/route';
import { POST as answerRoute } from '@/app/api/asks/[id]/answer/route';
import { POST as noteRoute } from '@/app/api/asks/[id]/note/route';
import { POST as decideRoute } from '@/app/api/asks/[id]/decide/route';
import { POST as reportRoute } from '@/app/api/reports/ask/[id]/route';
import { request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

export interface PublicAsk {
  id: string;
  author: { handle: string };
  audience: 'friends' | 'everyone';
  item: string;
  priceRupees: number;
  why: string;
  alternative: string | null;
  note: string | null;
  outcome: 'bought' | 'waiting' | 'skipped' | null;
  counts: { buy: number; wait: number };
  answers: { author: { handle: string }; verdict: 'buy' | 'wait'; reason: string; mine: boolean }[];
  mine: { verdict: 'buy' | 'wait'; reason: string } | null;
  canAnswer: boolean;
  isAsker: boolean;
}
type Wire = {
  ask?: PublicAsk;
  asks?: PublicAsk[];
  nextCursor?: string | null;
  error?: { code: string; message: string; fields?: Record<string, string> };
};
type Handler = (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

async function send(handler: Handler, method: string, path: string, id: string, body: unknown, opts: Opts) {
  const res = await handler(request(method, path, body, opts), { params: Promise.resolve({ id }) });
  const text = await res.text();
  let data: Wire = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, text };
}
const enc = encodeURIComponent;

export const listAsks = (opts: Opts = {}, query = '') =>
  send(listRoute, 'GET', `/api/asks${query}`, '', undefined, opts);
export const askPublic = (body: unknown, opts: Opts = {}) =>
  send(createRoute, 'POST', '/api/asks', '', body, opts);
export const removeAsk = (id: string, opts: Opts = {}) =>
  send(removeRoute, 'DELETE', `/api/asks/${enc(id)}`, id, undefined, opts);
export const answer = (id: string, body: unknown, opts: Opts = {}) =>
  send(answerRoute, 'POST', `/api/asks/${enc(id)}/answer`, id, body, opts);
export const note = (id: string, text: unknown, opts: Opts = {}) =>
  send(noteRoute, 'POST', `/api/asks/${enc(id)}/note`, id, { note: text }, opts);
export const decide = (id: string, outcome: unknown, opts: Opts = {}) =>
  send(decideRoute, 'POST', `/api/asks/${enc(id)}/decide`, id, { outcome }, opts);
export const reportAsk = (id: string, body: unknown, opts: Opts = {}) =>
  send(reportRoute, 'POST', `/api/reports/ask/${enc(id)}`, id, body, opts);
