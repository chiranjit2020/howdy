import { townHallMembers } from '@db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * Who keeps order in a Town Hall (ADR-041). The owner can do everything; a Deputy keeps order among ordinary members —
 * takes their posts down, clears the held tray, answers join requests, invites, and removes ordinary members — but never
 * acts on the owner or another Deputy. Only the owner edits or deletes the Town Hall, appoints or stands down Deputies,
 * and hands the Town Hall over.
 */
export type HallRole = 'owner' | 'deputy' | 'member';

export const isStaff = (role: HallRole | null | undefined): role is 'owner' | 'deputy' =>
  role === 'owner' || role === 'deputy';

/**
 * May someone with `actor`'s role act on someone whose role here is `target` (null: not a member any more)? The owner
 * may act on anyone but the owner; a Deputy only on ordinary members and former members.
 */
export function outranks(actor: HallRole | null, target: HallRole | null): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'deputy') return target === null || target === 'member';
  return false;
}

/** My role in this Town Hall while I am an ACTIVE member; null otherwise (invited, requested, gone). */
export async function activeRole(userId: string, townHallId: string): Promise<HallRole | null> {
  const [row] = await getDb()
    .select({ role: townHallMembers.role })
    .from(townHallMembers)
    .where(
      and(
        eq(townHallMembers.townHallId, townHallId),
        eq(townHallMembers.userId, userId),
        eq(townHallMembers.status, 'active'),
      ),
    )
    .limit(1);
  return (row?.role as HallRole | undefined) ?? null;
}

/** The active roles of these people in one Town Hall (anyone missing is not a member). */
export async function rolesIn(townHallId: string, userIds: string[]): Promise<Map<string, HallRole>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ userId: townHallMembers.userId, role: townHallMembers.role })
    .from(townHallMembers)
    .where(
      and(
        eq(townHallMembers.townHallId, townHallId),
        eq(townHallMembers.status, 'active'),
        inArray(townHallMembers.userId, ids),
      ),
    );
  return new Map(rows.map((r) => [r.userId, r.role as HallRole]));
}
