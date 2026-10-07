import { requireSession } from '@/modules/auth';
import { reactToStory } from '@/modules/stories';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { storyReactionSchema } from '@/shared/validation/stories';

export const dynamic = 'force-dynamic';

/** Give, change or take back my reaction to a Story (`kind: null` takes it back). */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { kind } = await readJson(req, storyReactionSchema);
  return json(await reactToStory(user.id, (await params).id ?? '', kind));
});
