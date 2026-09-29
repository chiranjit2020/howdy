import { requireSession } from '@/modules/auth';
import { listHeld } from '@/modules/whispers';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/**
 * My held tray (ADR-026): Whispers kept back from me because I restricted their sender. Reading it tells the sender
 * nothing (no read position, no "Seen", no event).
 */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ held: await listHeld(user.id) });
});
