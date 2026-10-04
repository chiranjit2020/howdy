import { reports, suspensions } from '@db/schema';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/platform/db';

/**
 * The moderation part of "Download my data" (ADR-037).
 *  - Suspensions of my account: what sign-in told me (the reason, from when, until when) and my appeal with its answer.
 *    Never which moderator, or which report led to it.
 *  - Reports I filed: what I sent (about what kind of thing, the reason, my own words). Not the person reported, the
 *    evidence snapshot (someone else's words) or what a moderator did — a report's outcome is never shared with its
 *    reporter, and naming the person could reveal that their account is still there behind a block.
 */

const EXPORT_CAP = 1000;

export interface ModerationExport {
  suspensions: {
    reason: string;
    from: Date;
    until: Date | null;
    endedAt: Date | null;
    appeal: { text: string; sentAt: Date; answer: 'waiting' | 'lifted' | 'stands' } | null;
  }[];
  reportsFiled: { about: string; reason: string; details: string | null; sentAt: Date }[];
}

export async function moderationExport(userId: string): Promise<ModerationExport> {
  const db = getDb();
  const [mine, filed] = await Promise.all([
    db
      .select({
        reason: suspensions.reason,
        createdAt: suspensions.createdAt,
        endsAt: suspensions.endsAt,
        liftedAt: suspensions.liftedAt,
        appealText: suspensions.appealText,
        appealedAt: suspensions.appealedAt,
        appealStatus: suspensions.appealStatus,
      })
      .from(suspensions)
      .where(eq(suspensions.userId, userId))
      .orderBy(asc(suspensions.createdAt))
      .limit(EXPORT_CAP),
    db
      .select({
        subject: reports.subject,
        reason: reports.reason,
        details: reports.details,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId))
      .orderBy(asc(reports.createdAt))
      .limit(EXPORT_CAP),
  ]);
  return {
    suspensions: mine.map((s) => ({
      reason: s.reason,
      from: s.createdAt,
      until: s.endsAt,
      endedAt: s.liftedAt,
      appeal:
        s.appealText && s.appealedAt
          ? {
              text: s.appealText,
              sentAt: s.appealedAt,
              answer:
                s.appealStatus === 'granted' ? 'lifted' : s.appealStatus === 'upheld' ? 'stands' : 'waiting',
            }
          : null,
    })),
    reportsFiled: filed.map((r) => ({
      about: r.subject,
      reason: r.reason,
      details: r.details,
      sentAt: r.createdAt,
    })),
  };
}
