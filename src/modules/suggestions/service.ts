import { suggestionDismissals } from '@db/schema';
import { sql } from 'drizzle-orm';
import { can } from '@/modules/authz';
import { getCards, getFenceResources, resolveHandle } from '@/modules/profiles';
import { getDb } from '@/platform/db';
import { enforceRateLimit, type RateLimitRule } from '@/platform/rate-limit';
import type { PortraitTint } from '@/shared/validation/profile';

/**
 * "Pals you may know" (Phase 13, ADR-029): people who are Pals with at least two of my Pals, most shared Pals first.
 * Worked out in Postgres from the Pal links, when asked — no stored graph, no model. Nobody is suggested who:
 *  - is me, already my Pal, or has any Pal link with me at all (an ask either way, or one declined — ever);
 *  - has any block, mute or restrict with me, in either direction;
 *  - has switched suggestions off (`profiles.discoverable`), or whom I dismissed;
 *  - is not active, or whose Porch I could not open anyway (the same `profile:view` policy as the Porch).
 * Every exclusion looks exactly like "not enough shared Pals", so a suggestion's absence says nothing about why.
 */

const READ: RateLimitRule = { limit: 60, windowSec: 60 };
const MANAGE: RateLimitRule = { limit: 60, windowSec: 3600 };
/** At least this many shared Pals before anyone is suggested. */
export const MIN_SHARED = 2;
const SHOWN = 10;
const CANDIDATES = 40;

export interface PalSuggestion {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  /** How many of my Pals are their Pals too. */
  shared: number;
  /** Up to two of those shared Pals, to say why. They are my own Pals, so I may see them. */
  via: { handle: string; displayName: string }[];
}

export async function palSuggestions(userId: string): Promise<PalSuggestion[]> {
  await enforceRateLimit(`suggestions:read:${userId}`, READ);
  const result = await getDb().execute(sql`
    with mine as (
      select case when user_low = ${userId} then user_high else user_low end as pal
      from posse_links where status = 'accepted' and ${userId} in (user_low, user_high)
    ),
    fof as (
      select case when l.user_low = m.pal then l.user_high else l.user_low end as cand, m.pal as via
      from mine m join posse_links l on l.status = 'accepted' and m.pal in (l.user_low, l.user_high)
    )
    select f.cand, count(distinct f.via)::int as shared, (array_agg(distinct f.via))[1:2] as vias
    from fof f
    join users u on u.id = f.cand and u.status = 'active'
    join profiles p on p.user_id = f.cand and p.discoverable
    where f.cand <> ${userId}
      and not exists (select 1 from posse_links x
        where x.user_low = least(${userId}::uuid, f.cand) and x.user_high = greatest(${userId}::uuid, f.cand))
      and not exists (select 1 from user_controls c
        where (c.actor_id = ${userId} and c.target_id = f.cand) or (c.actor_id = f.cand and c.target_id = ${userId}))
      and not exists (select 1 from suggestion_dismissals d where d.user_id = ${userId} and d.dismissed_id = f.cand)
    group by f.cand
    having count(distinct f.via) >= ${MIN_SHARED}
    order by shared desc, f.cand
    limit ${CANDIDATES}`);
  const rows = result.rows as { cand: string; shared: number; vias: string[] }[];
  if (rows.length === 0) return [];

  const cands = rows.map((r) => r.cand);
  const [ranches, cards] = await Promise.all([
    getFenceResources(cands),
    getCards([...cands, ...rows.flatMap((r) => r.vias)]),
  ]);
  const me = { kind: 'user' as const, id: userId, status: 'active' as const };
  const out: PalSuggestion[] = [];
  for (const r of rows) {
    const ranch = ranches.get(r.cand);
    const card = cards.get(r.cand);
    // No Pal link and no control between us (excluded above), so to them I am a passer-by.
    if (!ranch || !card || !can(me, 'profile:view', ranch, { relationship: 'PASSERBY' }).allow) continue;
    out.push({
      handle: card.handle,
      displayName: card.displayName,
      portraitTint: card.portraitTint,
      shared: r.shared,
      via: r.vias.flatMap((v) => {
        const c = cards.get(v);
        return c ? [{ handle: c.handle, displayName: c.displayName }] : [];
      }),
    });
    if (out.length === SHOWN) break;
  }
  return out;
}

/**
 * "Not now": never suggest this person to me again. The same answer whatever the call sign (a real person, a made-up
 * name, someone hidden), so it cannot be used to find out who exists.
 */
export async function dismissSuggestion(userId: string, handle: string): Promise<void> {
  await enforceRateLimit(`suggestions:manage:${userId}`, MANAGE);
  const other = await resolveHandle(handle);
  if (!other || other.userId === userId) return;
  await getDb()
    .insert(suggestionDismissals)
    .values({ userId, dismissedId: other.userId })
    .onConflictDoNothing();
}
