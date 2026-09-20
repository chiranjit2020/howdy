import { requireSession } from '@/modules/auth';
import { resolveHandle } from '@/modules/profiles';
import { act, spendRequestBudget } from '@/modules/relationships';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askByHandleSchema } from '@/shared/validation/relationships';

/**
 * Ask someone to join my Posse by their call sign. This is how people reach a Ranch that is private (posse-only), which
 * they cannot open and so cannot see a button on.
 *
 * The answer is ALWAYS the same 202 — whether the person exists, is suspended, has blocked me, has declined me, or is me.
 * Every ask spends the same request budget first (`act` does it for real targets; the branch below does it for the rest),
 * so even hitting the daily limit looks identical whatever the target was, and the form cannot be used to probe who is
 * registered or who blocked whom, nor to scan call signs quickly.
 */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const { handle } = await readJson(req, askByHandleSchema);

  const target = await resolveHandle(handle);
  if (target && target.userId !== user.id) await act(user.id, target.userId, 'request');
  else await spendRequestBudget(user.id);
  return json({ ok: true }, { status: 202 });
});
