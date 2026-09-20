import { pingDb } from '@/platform/db';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Liveness/readiness. Reports only up/down — never connection details. */
export const GET = route(async () => {
  const db = await pingDb();
  return json({ status: db ? 'ok' : 'degraded', db: db ? 'up' : 'down' }, { status: db ? 200 : 503 });
});
