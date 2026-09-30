import { requireSession } from '@/modules/auth';
import { dismissSuggestion } from '@/modules/suggestions';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { dismissSuggestionSchema } from '@/shared/validation/relationships';

export const dynamic = 'force-dynamic';

/** "Not now": never suggest this person again. Always the same answer, whoever the call sign names. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { handle } = await readJson(req, dismissSuggestionSchema);
  await dismissSuggestion(user.id, handle);
  return json({ ok: true });
});
