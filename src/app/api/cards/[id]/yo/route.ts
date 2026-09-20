import { requireSession } from '@/modules/auth';
import { setYo } from '@/modules/fence';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { yoSchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/** Give (`{on:true}`) or take back (`{on:false}`) a Yo. One per person per card; idempotent both ways. */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { on } = await readJson(req, yoSchema);
  return json(await setYo(user.id, (await params).id ?? '', on));
});
