import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { storiesOf } from '@/modules/stories';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** One person's live Stories as I may see them (ADR-047); none for me looks exactly like none at all (404). */
export const GET = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const stories = await storiesOf(user.id, (await params).handle ?? '');
  if (!stories) throw new AppError('NOT_FOUND');
  await attachPortraits(
    user.id,
    stories.flatMap((s) => [...(s.viewers ?? []), ...(s.reactions ?? [])].map((v) => v.person)),
  );
  return json({ stories });
});
