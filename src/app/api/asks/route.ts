import { withAskPortraits } from '@/app/_lib/asks';
import { createPublicAsk, listAsks } from '@/modules/asks';
import { requireSession } from '@/modules/auth';
import { AppError } from '@/platform/errors';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { askListQuerySchema, createPublicAskSchema } from '@/shared/validation/town-halls';

export const dynamic = 'force-dynamic';

/** The Buy or wait page (ADR-066): `?show=all|friends|mine`, `?cursor=` for the next page. Signed in only. */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const query = askListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) throw new AppError('BAD_REQUEST');
  const page = await listAsks(user.id, query.data.show, { cursor: query.data.cursor });
  await withAskPortraits(user.id, page.asks);
  return json(page);
});

/** Ask a public question, to my friends or to everyone (ADR-066). Three a day, shared with group questions. */
export const POST = route(async ({ req }) => {
  const { user } = await requireSession(req);
  const input = await readJson(req, createPublicAskSchema);
  const ask = await createPublicAsk(user.id, input);
  await withAskPortraits(user.id, [ask]);
  return json({ ask }, { status: 201 });
});
