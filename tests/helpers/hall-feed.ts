import { GET as feedRoute, POST as postRoute } from '@/app/api/town-halls/[id]/posts/route';
import { GET as heldRoute } from '@/app/api/town-halls/[id]/held/route';
import { DELETE as removePostRoute } from '@/app/api/hall-posts/[id]/route';
import { POST as replyRoute } from '@/app/api/hall-posts/[id]/replies/route';
import { POST as reactRoute } from '@/app/api/hall-posts/[id]/react/route';
import { POST as approvePostRoute } from '@/app/api/hall-posts/[id]/approve/route';
import { DELETE as removeReplyRoute } from '@/app/api/hall-replies/[id]/route';
import { POST as approveReplyRoute } from '@/app/api/hall-replies/[id]/approve/route';
import { POST as reportPostRoute } from '@/app/api/reports/hall-post/[id]/route';
import { request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };

export interface HallReply {
  id: string;
  body: string;
  author: { handle: string };
  mine: boolean;
  canRemove: boolean;
}
export interface HallPost {
  id: string;
  body: string;
  author: { handle: string };
  mine: boolean;
  canRemove: boolean;
  canReact: boolean;
  canReply: boolean;
  reactions: Record<string, number>;
  myReaction: string | null;
  replies: HallReply[];
}
type Wire = {
  posts?: HallPost[];
  post?: HallPost;
  reply?: HallReply;
  nextCursor?: string | null;
  myReaction?: string | null;
  replies?: { id: string; onPost: string }[];
  error?: { code: string; message: string; fields?: Record<string, string> };
  [k: string]: unknown;
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

export const feed = (hallId: string, opts: Opts = {}, query = '') =>
  send(feedRoute, 'GET', `/api/town-halls/${enc(hallId)}/posts${query}`, hallId, undefined, opts);
export const post = (hallId: string, body: unknown, opts: Opts = {}) =>
  send(postRoute, 'POST', `/api/town-halls/${enc(hallId)}/posts`, hallId, body, opts);
export const held = (hallId: string, opts: Opts = {}) =>
  send(heldRoute, 'GET', `/api/town-halls/${enc(hallId)}/held`, hallId, undefined, opts);
export const removePost = (id: string, opts: Opts = {}) =>
  send(removePostRoute, 'DELETE', `/api/hall-posts/${enc(id)}`, id, undefined, opts);
export const reply = (postId: string, body: unknown, opts: Opts = {}) =>
  send(replyRoute, 'POST', `/api/hall-posts/${enc(postId)}/replies`, postId, body, opts);
export const react = (postId: string, body: unknown, opts: Opts = {}) =>
  send(reactRoute, 'POST', `/api/hall-posts/${enc(postId)}/react`, postId, body, opts);
export const approvePost = (id: string, opts: Opts = {}) =>
  send(approvePostRoute, 'POST', `/api/hall-posts/${enc(id)}/approve`, id, {}, opts);
export const removeReply = (id: string, opts: Opts = {}) =>
  send(removeReplyRoute, 'DELETE', `/api/hall-replies/${enc(id)}`, id, undefined, opts);
export const approveReply = (id: string, opts: Opts = {}) =>
  send(approveReplyRoute, 'POST', `/api/hall-replies/${enc(id)}/approve`, id, {}, opts);
export const reportPost = (id: string, body: unknown, opts: Opts = {}) =>
  send(reportPostRoute, 'POST', `/api/reports/hall-post/${enc(id)}`, id, body, opts);
