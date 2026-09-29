import { requireSession } from '@/modules/auth';
import { decideAppeal } from '@/modules/moderation';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { appealDecisionSchema } from '@/shared/validation/moderation';

export const dynamic = 'force-dynamic';

/** Answer one appeal: `grant` lifts the suspension, `uphold` lets it stand. Answered once; a repeat is 409. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { decision } = await readJson(req, appealDecisionSchema);
  await decideAppeal(user.id, (await params).id ?? '', decision);
  return json({ ok: true });
});
