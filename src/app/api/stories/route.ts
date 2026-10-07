import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { postStory, storyRing } from '@/modules/stories';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { postStorySchema } from '@/shared/validation/stories';

export const dynamic = 'force-dynamic';

/** The Story rings on Home (ADR-047): mine first, then Pals with Stories for me. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const ring = await storyRing(user.id);
  await attachPortraits(
    user.id,
    ring.map((r) => r.person),
  );
  return json({ ring });
});

/** Post a Story: one of my finished photos, an optional caption, for Pals or Close Pals, for 12 hours. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const input = await readJson(req, postStorySchema);
  return json({ story: await postStory(user.id, input) }, { status: 201 });
});
