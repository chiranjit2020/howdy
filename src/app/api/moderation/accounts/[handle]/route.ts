import { requireSession } from '@/modules/auth';
import { findAccountForModeration, reinstateAccount, suspendAccount } from '@/modules/moderation';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { accountActionSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/** One account's standing, suspended ones included (a moderator must find who they are about to reinstate). */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const account = await findAccountForModeration(user.id, (await params).handle ?? '');
  if (!account) throw new AppError('NOT_FOUND');
  return json({ account });
});

/** Suspend (with a reason and a length) or reinstate an account directly, independent of any report. Both idempotent. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const body = await readJson(req, accountActionSchema);
  const handle = (await params).handle ?? '';
  if (body.action === 'suspend') {
    await suspendAccount(user.id, handle, { length: body.length, reason: body.reason });
  } else {
    await reinstateAccount(user.id, handle);
  }
  return json({ ok: true });
});
