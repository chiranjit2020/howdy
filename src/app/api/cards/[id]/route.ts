import { attachPortraits } from '@/app/_lib/social';
import { requireSession } from '@/modules/auth';
import { editCard, removeCard } from '@/modules/fence';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { editCardSchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/**
 * Change the words of your own card (ADR-063). Only its writer may; anyone else (and anyone naming a card that does not
 * exist) gets the same 404. Answers with the card as the writer now sees it.
 */
export const PATCH = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { body } = await readJson(req, editCardSchema);
  const card = await editCard(user.id, (await params).id ?? '', body);
  await attachPortraits(user.id, [card.author, ...card.replies.map((r) => r.author)]);
  return json({ card });
});

/**
 * Take a card down. Allowed for its writer and for the owner of the Fence it is on; anyone else (and anyone naming a card
 * that does not exist) gets the same 404.
 */
export const DELETE = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  await removeCard(user.id, (await params).id ?? '');
  return json({ ok: true });
});
