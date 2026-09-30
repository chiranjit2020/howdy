import { GET as queueRoute } from '@/app/api/moderation/reports/route';
import { POST as actRoute } from '@/app/api/moderation/reports/[id]/route';
import { GET as accountRoute, POST as accountActRoute } from '@/app/api/moderation/accounts/[handle]/route';
import { GET as appealsRoute } from '@/app/api/moderation/appeals/route';
import { POST as decideRoute } from '@/app/api/moderation/appeals/[id]/route';
import { authHandlers } from '@/modules/auth';
import { call, request } from './auth';
import { q } from './social';

type Opts = { cookie?: string; ip?: string; origin?: string | null };
export interface QueueItem {
  id: string;
  reason: string;
  details: string | null;
  evidenceText: string | null;
  subject: string;
  canRemove: boolean;
  canRemoveCard: boolean;
  cardHasPhoto: boolean;
  status: string;
  reporter: { handle: string } | null;
  target: { handle: string; status: string } | null;
  targetHeld: boolean;
  reviewedBy: { handle: string } | null;
}
export interface AppealItem {
  id: string;
  person: { handle: string; status: string } | null;
  reason: string;
  endsAt: string | null;
  suspendedBy: { handle: string } | null;
  text: string;
  [k: string]: unknown;
}
type Wire = {
  reports?: QueueItem[];
  appeals?: AppealItem[];
  nextCursor?: string | null;
  account?: { handle: string; displayName: string; status: string; [k: string]: unknown };
  error?: {
    code: string;
    message: string;
    requestId: string;
    data?: Record<string, string | null>;
    fields?: Record<string, string>;
  };
  [k: string]: unknown;
};

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

/**
 * A bare action string is expanded to a full body; `suspend` gets a default length (and, for accounts, a reason),
 * because both are required now (ADR-023). Pass an object to control the body exactly.
 */
const reportBody = (action: unknown) =>
  typeof action === 'string' ? (action === 'suspend' ? { action, length: '7d' } : { action }) : action;
const accountBody = (action: unknown) =>
  typeof action === 'string'
    ? action === 'suspend'
      ? { action, length: '7d', reason: 'spam' }
      : { action }
    : action;

/** GET /api/moderation/reports[?query]. */
export const queue = (opts: Opts = {}, query = '') =>
  dynamic(queueRoute, 'GET', `/api/moderation/reports${query}`, {}, undefined, opts);

/** POST /api/moderation/reports/:id {action, ...}. */
export const actOnReport = (id: string, action: unknown, opts: Opts = {}) =>
  dynamic(actRoute, 'POST', `/api/moderation/reports/${enc(id)}`, { id }, reportBody(action), opts);

/** GET /api/moderation/accounts/:handle. */
export const account = (handle: string, opts: Opts = {}) =>
  dynamic(accountRoute, 'GET', `/api/moderation/accounts/${enc(handle)}`, { handle }, undefined, opts);

/** POST /api/moderation/accounts/:handle {action, ...}. */
export const actOnAccount = (handle: string, action: unknown, opts: Opts = {}) =>
  dynamic(
    accountActRoute,
    'POST',
    `/api/moderation/accounts/${enc(handle)}`,
    { handle },
    accountBody(action),
    opts,
  );

/** GET /api/moderation/appeals[?query]. */
export const appeals = (opts: Opts = {}, query = '') =>
  dynamic(appealsRoute, 'GET', `/api/moderation/appeals${query}`, {}, undefined, opts);

/** POST /api/moderation/appeals/:id {decision}. */
export const decide = (id: string, decision: unknown, opts: Opts = {}) =>
  dynamic(decideRoute, 'POST', `/api/moderation/appeals/${enc(id)}`, { id }, { decision }, opts);

/** POST /api/auth/appeal — the suspended person's own appeal, with their sign-in details. */
export const fileAppeal = (body: unknown, opts: Opts = {}) =>
  call(authHandlers.appeal, 'POST', '/api/auth/appeal', body, opts);

/** There is no self-service promotion: a role is set by hand, which is what this does. */
export const makeRole = (handle: string, role: 'member' | 'moderator' | 'admin') =>
  q('update users set role = $2 where handle = $1', [handle, role]);
