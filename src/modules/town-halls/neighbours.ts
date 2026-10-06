import { sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/** How long both people must have been active members of the same Town Hall to count as neighbours (ADR-044). */
export const NEIGHBOUR_DAYS = 14;

/**
 * Are these two Town Hall neighbours: both ACTIVE members of one Town Hall, each for at least `NEIGHBOUR_DAYS`, counted
 * from when they became a member (not from an invite or a request)? Lets neighbours give each other Tributes and Marks.
 * Says nothing about blocks — the policy decides those.
 */
export async function areNeighbours(a: string, b: string, now: Date = new Date()): Promise<boolean> {
  if (a === b) return false;
  const since = new Date(now.getTime() - NEIGHBOUR_DAYS * 24 * 60 * 60 * 1000);
  const { rows } = await getDb().execute(sql`
    select 1 from town_hall_members x
    join town_hall_members y on y.town_hall_id = x.town_hall_id
    where x.user_id = ${a} and y.user_id = ${b}
      and x.status = 'active' and y.status = 'active'
      and coalesce(x.joined_at, x.created_at) <= ${since}
      and coalesce(y.joined_at, y.created_at) <= ${since}
    limit 1`);
  return rows.length > 0;
}
