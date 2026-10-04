import { marks } from '@db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * The Marks part of "Download my data" (ADR-037). Marks I gave are mine (to whom, which kind, when). Marks I received
 * are exported exactly as my Vibe Matrix shows them — counts per kind, never who gave which: not even the person who
 * received them is ever told that.
 */

const EXPORT_CAP = 2000;

export interface MarksExport {
  given: { targetId: string; kind: string; givenAt: Date }[];
  received: Record<string, number>;
}

export async function marksExport(userId: string): Promise<MarksExport> {
  const db = getDb();
  const [given, counts] = await Promise.all([
    db
      .select({ targetId: marks.targetId, kind: marks.kind, createdAt: marks.createdAt })
      .from(marks)
      .where(eq(marks.raterId, userId))
      .orderBy(asc(marks.createdAt))
      .limit(EXPORT_CAP),
    db
      .select({ kind: marks.kind, n: sql<number>`count(*)::int` })
      .from(marks)
      .where(eq(marks.targetId, userId))
      .groupBy(marks.kind),
  ]);
  return {
    given: given.map((m) => ({ targetId: m.targetId, kind: m.kind, givenAt: m.createdAt })),
    received: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
  };
}
