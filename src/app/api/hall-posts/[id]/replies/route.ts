import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { createReply } from '@/modules/town-halls';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { hallReplySchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** Reply to a Town Hall post. The writer is always the signed-in user. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body } = await readJson(req, hallReplySchema);
  const reply = await createReply(user.id, (await params).id ?? '', body);
  await attachPortraits(user.id, [reply.author]);
  return json({ reply }, { status: 201 });
});
