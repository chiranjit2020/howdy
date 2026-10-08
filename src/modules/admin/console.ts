import { auditLog, postCards, reports, sessions, tracks, tributes, users, yos } from '@db/schema';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getDb } from '@/platform/db';
import { securityOverview, type SecurityOverview } from './security';

/**
 * The Mission Console (Control Room home): the Security Center's data plus time-ranged telemetry — KPIs against the
 * previous period, an activity series for the chart and sparklines, social counts and the safety queue. Every number
 * comes from a real table; nothing is sampled, estimated or invented. Admin-only: `securityOverview` gates it.
 */

export const RANGES = {
  '1h': { ms: 60 * 60 * 1000, buckets: 12 },
  '6h': { ms: 6 * 60 * 60 * 1000, buckets: 12 },
  '24h': { ms: 24 * 60 * 60 * 1000, buckets: 24 },
  '7d': { ms: 7 * 24 * 60 * 60 * 1000, buckets: 28 },
} as const;
export type ConsoleRange = keyof typeof RANGES;
export const isConsoleRange = (v: unknown): v is ConsoleRange =>
  typeof v === 'string' && Object.hasOwn(RANGES, v);

/** A count now and in the period just before it, for the "+8.2%" deltas. */
export interface Compare {
  now: number;
  prev: number;
}

export interface ActivityBucket {
  at: string;
  signIns: number;
  signUps: number;
  failed: number;
  reports: number;
}

export interface ConsoleData extends SecurityOverview {
  range: ConsoleRange;
  series: ActivityBucket[];
  kpis: {
    totalUsers: number;
    activeUsers: number;
    signUps: Compare;
    signIns: Compare;
    loginFails: Compare;
    alerts: Compare;
  };
  social: { postCards: Compare; yos: Compare; tracks: Compare; tributes: Compare };
  queue: {
    open: number;
    reviewing: number;
    resolved: number;
    oldest: { id: string; reason: string; subject: string; source: string; at: string }[];
  };
}

const EVENTS = ['login_success', 'signup', 'login_failed', 'security_alert'] as const;

export async function consoleData(
  userId: string,
  range: ConsoleRange = '24h',
  now: Date = new Date(),
): Promise<ConsoleData> {
  // The overview re-checks that this is a ready admin (zero-trust) before any of the reads below run.
  const overview = await securityOverview(userId, now);
  const db = getDb();
  const { ms, buckets } = RANGES[range];
  const step = ms / buckets;
  const since = new Date(now.getTime() - ms);
  const before = new Date(since.getTime() - ms);
  const stepSec = step / 1000;
  const sinceSec = since.getTime() / 1000;

  /** Count rows of `table` created in this period and the one before it. */
  const compare = (createdAt: PgColumn, from: PgTable) =>
    db
      .select({
        now: sql<number>`count(*) filter (where ${createdAt} >= ${since})::int`,
        prev: sql<number>`count(*) filter (where ${createdAt} < ${since})::int`,
      })
      .from(from)
      .where(and(gte(createdAt, before), lt(createdAt, now)));
  const bucketOf = (col: PgColumn) =>
    sql<number>`floor((extract(epoch from ${col}) - ${sinceSec}) / ${stepSec})::int`;

  const [
    eventSeries,
    reportSeries,
    eventCompare,
    totals,
    active,
    cards,
    yoRows,
    tributeRows,
    trackRows,
    queue,
    oldest,
  ] = await Promise.all([
    db
      .select({ b: bucketOf(auditLog.createdAt), event: auditLog.event, n: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          gte(auditLog.createdAt, since),
          lt(auditLog.createdAt, now),
          inArray(auditLog.event, [...EVENTS]),
        ),
      )
      .groupBy(sql`1`, auditLog.event),
    db
      .select({ b: bucketOf(reports.createdAt), n: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(gte(reports.createdAt, since), lt(reports.createdAt, now)))
      .groupBy(sql`1`),
    db
      .select({
        event: auditLog.event,
        now: sql<number>`count(*) filter (where ${auditLog.createdAt} >= ${since})::int`,
        prev: sql<number>`count(*) filter (where ${auditLog.createdAt} < ${since})::int`,
      })
      .from(auditLog)
      .where(
        and(
          gte(auditLog.createdAt, before),
          lt(auditLog.createdAt, now),
          inArray(auditLog.event, [...EVENTS]),
        ),
      )
      .groupBy(auditLog.event),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(inArray(users.status, ['active', 'suspended'])),
    db
      .select({ n: sql<number>`count(distinct ${sessions.userId})::int` })
      .from(sessions)
      .where(gte(sessions.lastSeenAt, since)),
    compare(postCards.createdAt, postCards),
    compare(yos.createdAt, yos),
    compare(tributes.createdAt, tributes),
    // A Track is a UTC date, not a moment (ADR-014), so it is counted by day.
    db
      .select({
        now: sql<number>`count(*) filter (where ${tracks.seenOn} >= ${since.toISOString().slice(0, 10)})::int`,
        prev: sql<number>`count(*) filter (where ${tracks.seenOn} < ${since.toISOString().slice(0, 10)})::int`,
      })
      .from(tracks)
      .where(gte(tracks.seenOn, before.toISOString().slice(0, 10))),
    db
      .select({
        open: sql<number>`count(*) filter (where ${reports.status} = 'open')::int`,
        reviewing: sql<number>`count(*) filter (where ${reports.status} = 'reviewing')::int`,
        resolved: sql<number>`count(*) filter (where ${reports.status} in ('actioned', 'dismissed') and ${reports.reviewedAt} >= ${since})::int`,
      })
      .from(reports),
    db
      .select({
        id: reports.id,
        reason: reports.reason,
        subject: reports.subject,
        source: reports.source,
        at: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.status, 'open'))
      .orderBy(asc(reports.createdAt))
      .limit(3),
  ]);

  const series: ActivityBucket[] = Array.from({ length: buckets }, (_, i) => ({
    at: new Date(since.getTime() + i * step).toISOString(),
    signIns: 0,
    signUps: 0,
    failed: 0,
    reports: 0,
  }));
  const inRange = (b: number) => b >= 0 && b < buckets;
  for (const r of eventSeries) {
    if (!inRange(r.b)) continue;
    const s = series[r.b]!;
    if (r.event === 'login_success') s.signIns += r.n;
    else if (r.event === 'signup') s.signUps += r.n;
    else if (r.event === 'login_failed') s.failed += r.n;
  }
  for (const r of reportSeries) if (inRange(r.b)) series[r.b]!.reports += r.n;

  const ev = (e: (typeof EVENTS)[number]): Compare => {
    const row = eventCompare.find((r) => r.event === e);
    return { now: row?.now ?? 0, prev: row?.prev ?? 0 };
  };
  const pair = (rows: { now: number; prev: number }[]): Compare => ({
    now: rows[0]?.now ?? 0,
    prev: rows[0]?.prev ?? 0,
  });

  return {
    ...overview,
    range,
    series,
    kpis: {
      totalUsers: totals[0]?.n ?? 0,
      activeUsers: active[0]?.n ?? 0,
      signUps: ev('signup'),
      signIns: ev('login_success'),
      loginFails: ev('login_failed'),
      alerts: ev('security_alert'),
    },
    social: {
      postCards: pair(cards),
      yos: pair(yoRows),
      tracks: pair(trackRows),
      tributes: pair(tributeRows),
    },
    queue: {
      open: queue[0]?.open ?? 0,
      reviewing: queue[0]?.reviewing ?? 0,
      resolved: queue[0]?.resolved ?? 0,
      oldest: oldest.map((o) => ({ ...o, at: o.at.toISOString() })),
    },
  };
}
