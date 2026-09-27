import { requireSession } from '@/modules/auth';
import { setYo } from '@/modules/fence';
import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { yoSchema } from '@/shared/validation/fence';

export const dynamic = 'force-dynamic';

/**
 * Give (`{on:true, kind?}`, Yo by default), change (`{on:true, kind}` again) or take back (`{on:false}`) your reaction. One
 * per person per card; idempotent both ways.
 */
export const POST = route(async ({ req, params }) => {
  const { user } = await requireSession(req);
  const { on, kind } = await readJson(req, yoSchema);
  return json(await setYo(user.id, (await params).id ?? '', on, kind));
});
