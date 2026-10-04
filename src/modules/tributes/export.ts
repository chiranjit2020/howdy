import { tributes } from '@db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * The Tributes part of "Download my data" (ADR-037), as raw rows with user ids (the app layer names people and leaves
 * out anyone I cannot see now). Every Tribute waits for its owner first, so "waiting" reveals nothing either way.
 */

const EXPORT_CAP = 2000;

export interface TributeRow {
  otherId: string;
  body: string;
  state: 'published' | 'waiting';
  pinned: boolean;
  createdAt: Date;
}

export async function tributesExport(
  userId: string,
): Promise<{ onMyPorch: TributeRow[]; byMe: TributeRow[] }> {
  const db = getDb();
  const cols = {
    ownerId: tributes.ownerId,
    authorId: tributes.authorId,
    body: tributes.body,
    status: tributes.status,
    pinned: tributes.pinned,
    createdAt: tributes.createdAt,
  };
  const [onMine, byMe] = await Promise.all([
    db
      .select(cols)
      .from(tributes)
      .where(eq(tributes.ownerId, userId))
      .orderBy(asc(tributes.createdAt))
      .limit(EXPORT_CAP),
    db
      .select(cols)
      .from(tributes)
      .where(and(eq(tributes.authorId, userId)))
      .orderBy(asc(tributes.createdAt))
      .limit(EXPORT_CAP),
  ]);
  const row =
    (other: 'ownerId' | 'authorId') =>
    (t: (typeof onMine)[number]): TributeRow => ({
      otherId: t[other],
      body: t.body,
      state: t.status === 'published' ? 'published' : 'waiting',
      pinned: t.pinned,
      createdAt: t.createdAt,
    });
  return { onMyPorch: onMine.map(row('authorId')), byMe: byMe.map(row('ownerId')) };
}
