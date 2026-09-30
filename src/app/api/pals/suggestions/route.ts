import { requireSession } from '@/modules/auth';
import { palSuggestions } from '@/modules/suggestions';
import { json, route } from '@/platform/http/route';

export const dynamic = 'force-dynamic';

/** Pals you may know: people who are Pals with at least two of my Pals (ADR-029). */
export const GET = route(async ({ req }) => {
  const { user } = await requireSession(req);
  return json({ suggestions: await palSuggestions(user.id) });
});
