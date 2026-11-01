import { GET as feedRoute, POST as postRoute } from '@/app/api/town-halls/[id]/posts/route';
import { GET as heldRoute } from '@/app/api/town-halls/[id]/held/route';
import { DELETE as removePostRoute } from '@/app/api/hall-posts/[id]/route';
import { POST as replyRoute } from '@/app/api/hall-posts/[id]/replies/route';
import { POST as reactRoute } from '@/app/api/hall-posts/[id]/react/route';
import { POST as approvePostRoute } from '@/app/api/hall-posts/[id]/approve/route';
import { DELETE as unpinRoute, POST as pinRoute } from '@/app/api/hall-posts/[id]/pin/route';
import { POST as rsvpRoute } from '@/app/api/hall-posts/[id]/rsvp/route';
import { POST as voteRoute } from '@/app/api/hall-posts/[id]/vote/route';
import { POST as closePollRoute } from '@/app/api/hall-posts/[id]/close-poll/route';
import { POST as pollRoute } from '@/app/api/town-halls/[id]/polls/route';
import { POST as eventRoute } from '@/app/api/town-halls/[id]/events/route';
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
  /** The owner or a Deputy, on a published post. */
  canPin?: boolean;
  /** ADR-057: when the post is a poll. */
  poll?: {
    options: { id: string; label: string; votes: number }[];
    total: number;
    mine: string | null;
    closed: boolean;
    canClose: boolean;
  } | null;
  /** ADR-056: when the post is an event. */
  event?: {
    title: string;
    startsAt: string;
    place: string | null;
    counts: Record<'going' | 'maybe' | 'no', number>;
    mine: 'going' | 'maybe' | 'no' | null;
    closed: boolean;
    answers: Record<'going' | 'maybe' | 'no', { handle: string }[]> | null;
  } | null;
  reactions: Record<string, number>;
  myReaction: string | null;
  replies: HallReply[];
  /** ADR-046: the post's photo, when there is one this viewer may see. */
  photo?: { url: string; width: number; height: number } | null;
}
type Wire = {
  /** The pinned notice, first page only. */
  pinned?: HallPost | null;
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
export const createEvent = (hallId: string, body: unknown, opts: Opts = {}) =>
  send(eventRoute, 'POST', `/api/town-halls/${enc(hallId)}/events`, hallId, body, opts);
export const rsvp = (postId: string, answer: unknown, opts: Opts = {}) =>
  send(rsvpRoute, 'POST', `/api/hall-posts/${enc(postId)}/rsvp`, postId, { answer }, opts);
export const createPoll = (hallId: string, body: unknown, opts: Opts = {}) =>
  send(pollRoute, 'POST', `/api/town-halls/${enc(hallId)}/polls`, hallId, body, opts);
export const vote = (postId: string, optionId: unknown, opts: Opts = {}) =>
  send(voteRoute, 'POST', `/api/hall-posts/${enc(postId)}/vote`, postId, { optionId }, opts);
export const closePoll = (postId: string, opts: Opts = {}) =>
  send(closePollRoute, 'POST', `/api/hall-posts/${enc(postId)}/close-poll`, postId, {}, opts);
export const pin = (id: string, opts: Opts = {}) =>
  send(pinRoute, 'POST', `/api/hall-posts/${enc(id)}/pin`, id, {}, opts);
export const unpin = (id: string, opts: Opts = {}) =>
  send(unpinRoute, 'DELETE', `/api/hall-posts/${enc(id)}/pin`, id, undefined, opts);
export const approvePost = (id: string, opts: Opts = {}) =>
  send(approvePostRoute, 'POST', `/api/hall-posts/${enc(id)}/approve`, id, {}, opts);
export const removeReply = (id: string, opts: Opts = {}) =>
  send(removeReplyRoute, 'DELETE', `/api/hall-replies/${enc(id)}`, id, undefined, opts);
export const approveReply = (id: string, opts: Opts = {}) =>
  send(approveReplyRoute, 'POST', `/api/hall-replies/${enc(id)}/approve`, id, {}, opts);
export const reportPost = (id: string, body: unknown, opts: Opts = {}) =>
  send(reportPostRoute, 'POST', `/api/reports/hall-post/${enc(id)}`, id, body, opts);
