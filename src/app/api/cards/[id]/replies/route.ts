import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { postReply } from '@/modules/fence';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { postReplySchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/** Write a reply on the back of a card. The writer is always the signed-in user. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body } = await readJson(req, postReplySchema);
  const reply = await postReply(user.id, (await params).id ?? '', body);
  await attachPortraits(user.id, [reply.author]);
  return json({ reply }, { status: 201 });
});
