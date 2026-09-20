import { requireSession } from '@/modules/auth';
import { markThreadRead } from '@/modules/whispers';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { readWhisperSchema } from '@/shared/validation/whispers';

export const dynamic = 'force-dynamic';

/** Mark the thread read up to a position. Private to me: the other person is never told (there are no read receipts). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { upTo } = await readJson(req, readWhisperSchema);
  return json(await markThreadRead(user.id, (await params).handle ?? '', upTo));
});
