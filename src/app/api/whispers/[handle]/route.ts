import { requireSession } from '@/modules/auth';
import { burnThread, getThread, sendWhisper } from '@/modules/whispers';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { sendWhisperSchema, threadQuerySchema } from '@/shared/validation/whispers';

export const dynamic = 'force-dynamic';

/**
 * The thread with one person. A thread I may not open (a stranger, a pending request, a block, a made-up call sign) is always
 * the same 404. `?before=` pages back, `?after=` catches up after a dropped connection.
 */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const query = threadQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await getThread(user.id, (await params).handle ?? '', query.data);
  if (!page) throw new AppError('NOT_FOUND');
  return json(page);
});

/**
 * Send a Whisper: `{ clientId, body }`. Sending the same `clientId` again returns the first message (200) instead of a second
 * (201), so a retry after a dropped connection is always safe. The sender is always me.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { clientId, body } = await readJson(req, sendWhisperSchema);
  const sent = await sendWhisper(user.id, (await params).handle ?? '', clientId, body);
  return json({ message: sent.message }, { status: sent.created ? 201 : 200 });
});

/** Burn Thread: delete the whole thread for both people. Always allowed; the same answer for a thread that never existed. */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  return json(await burnThread(user.id, (await params).handle ?? ''));
});
