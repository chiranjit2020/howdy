import { GET as getRoute, POST as postRoute } from '@/app/api/town-halls/route';
import {
  DELETE as deleteRoute,
  GET as getOneRoute,
  PATCH as patchRoute,
  POST as actRoute,
} from '@/app/api/town-halls/[id]/route';
import { POST as inviteRoute } from '@/app/api/town-halls/[id]/invite/route';
import { GET as membersRoute } from '@/app/api/town-halls/[id]/members/route';
import {
  DELETE as removeMemberRoute,
  POST as memberActionRoute,
} from '@/app/api/town-halls/[id]/members/[handle]/route';
import { GET as requestsRoute } from '@/app/api/town-halls/[id]/requests/route';
import { GET as bansRoute, POST as banRoute } from '@/app/api/town-halls/[id]/bans/route';
import { DELETE as liftBanRoute } from '@/app/api/town-halls/[id]/bans/[handle]/route';
import { GET as mineRoute } from '@/app/api/me/town-halls/route';
import { GET as invitesRoute } from '@/app/api/me/town-halls/invites/route';
import { call, request } from './auth';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
type Wire = {
  townHall?: TownHall;
  townHalls?: TownHall[];
  members?: Member[];
  invites?: Invite[];
  requests?: { handle: string; askedAt: string }[];
  nextCursor?: string | null;
  error?: { code: string; message: string; requestId: string; fields?: Record<string, string> };
  [k: string]: unknown;
};
export interface TownHall {
  id: string;
  name: string;
  description: string;
  visibility: 'open' | 'members' | 'invite';
  joinRule: 'instant' | 'approval';
  isOwner: boolean;
  myRole: 'owner' | 'deputy' | 'member' | null;
  joined?: boolean;
  membership?: 'none' | 'active' | 'invited' | 'requested';
  canJoin?: boolean;
  canAsk?: boolean;
  requestsWaiting?: number | null;
}
export interface Member {
  handle: string;
  displayName: string;
  role: 'owner' | 'deputy' | 'member';
}
export interface Invite {
  townHallId: string;
  name: string;
  description: string;
  invitedBy: { handle: string };
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

export const directory = (opts: Opts = {}, query = '') =>
  dynamic(getRoute, 'GET', `/api/town-halls${query}`, {}, undefined, opts);

export const create = (body: unknown, opts: Opts = {}) =>
  dynamic(postRoute, 'POST', '/api/town-halls', {}, body, opts);

export const getOne = (id: string, opts: Opts = {}) =>
  dynamic(getOneRoute, 'GET', `/api/town-halls/${enc(id)}`, { id }, undefined, opts);

export const act = (id: string, action: unknown, opts: Opts = {}) =>
  dynamic(actRoute, 'POST', `/api/town-halls/${enc(id)}`, { id }, { action }, opts);

export const update = (id: string, patch: unknown, opts: Opts = {}) =>
  dynamic(patchRoute, 'PATCH', `/api/town-halls/${enc(id)}`, { id }, patch, opts);

export const remove = (id: string, opts: Opts = {}) =>
  dynamic(deleteRoute, 'DELETE', `/api/town-halls/${enc(id)}`, { id }, undefined, opts);

export const invite = (id: string, handle: unknown, opts: Opts = {}) =>
  dynamic(inviteRoute, 'POST', `/api/town-halls/${enc(id)}/invite`, { id }, { handle }, opts);

export const members = (id: string, opts: Opts = {}, query = '') =>
  dynamic(membersRoute, 'GET', `/api/town-halls/${enc(id)}/members${query}`, { id }, undefined, opts);

export const removeMember = (id: string, handle: string, opts: Opts = {}) =>
  dynamic(
    removeMemberRoute,
    'DELETE',
    `/api/town-halls/${enc(id)}/members/${enc(handle)}`,
    { id, handle },
    undefined,
    opts,
  );

export const mine = (opts: Opts = {}) =>
  call(mineRoute, 'GET', '/api/me/town-halls', undefined, opts) as Promise<{
    status: number;
    data: Wire;
    text: string;
    res: Response;
  }>;

export const myInvites = (opts: Opts = {}) =>
  call(invitesRoute, 'GET', '/api/me/town-halls/invites', undefined, opts) as Promise<{
    status: number;
    data: Wire;
    text: string;
    res: Response;
  }>;

/** POST /api/town-halls/:id/members/:handle {action} — a staff decision about one person (ADR-041). */
export const memberAction = (id: string, handle: string, action: string, opts: Opts = {}) =>
  dynamic(
    memberActionRoute,
    'POST',
    `/api/town-halls/${enc(id)}/members/${enc(handle)}`,
    { id, handle },
    { action },
    opts,
  );

/** GET /api/town-halls/:id/requests — waiting join requests (staff only). */
export const requests = (id: string, opts: Opts = {}) =>
  dynamic(requestsRoute, 'GET', `/api/town-halls/${enc(id)}/requests`, { id }, undefined, opts);

/** GET/POST /api/town-halls/:id/bans and DELETE /api/town-halls/:id/bans/:handle — the ban list (ADR-042). */
export const bans = (id: string, opts: Opts = {}) =>
  dynamic(bansRoute, 'GET', `/api/town-halls/${enc(id)}/bans`, { id }, undefined, opts) as Promise<{
    status: number;
    data: Wire & { bans?: { handle: string; bannedBy: string | null; bannedAt: string }[] };
    text: string;
    res: Response;
  }>;

export const ban = (id: string, handle: unknown, opts: Opts = {}) =>
  dynamic(banRoute, 'POST', `/api/town-halls/${enc(id)}/bans`, { id }, { handle }, opts);

export const liftBan = (id: string, handle: string, opts: Opts = {}) =>
  dynamic(
    liftBanRoute,
    'DELETE',
    `/api/town-halls/${enc(id)}/bans/${enc(handle)}`,
    { id, handle },
    undefined,
    opts,
  );
