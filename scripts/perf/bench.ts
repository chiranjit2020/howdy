/**
 * Phase 13: time the everyday reads against howdy_perf (~20k people), and record every SQL statement slower than
 * SLOW_MS with its text, so the slow ones can be EXPLAINed. Run: pnpm exec tsx scripts/perf/bench.ts [label]
 * (RTT_MS=10 to simulate the production network). Needs .dev/perf/.env = PERF_DATABASE_URL=<local howdy_perf>; see
 * docs/decisions/ADR-030 for how that database is built (scripts/perf/seed.sql).
 * Never points at dev or prod: DATABASE_URL is replaced by .dev/perf/.env before anything connects.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local', quiet: true });
process.env.DATABASE_URL = readFileSync('.dev/perf/.env', 'utf8').split('=').slice(1).join('=').trim();
delete process.env.REDIS_URL;

const SLOW_MS = 20;
type Q = { sql: string; ms: number; op: string };
const slow: Q[] = [];
let currentOp = '';
let queriesInOp = 0;
const origQuery = pg.Client.prototype.query;
// Time every statement at the driver: pool.query and transaction clients both end up here.
// RTT_MS simulates the network between the app and the database (production: Washington DC → Ohio, ~10 ms per round
// trip). Every statement waits that long before it is sent, whether called with a callback or as a promise.
const RTT = Number(process.env.RTT_MS ?? 0);
const later = <T>(fn: () => T): Promise<T> => new Promise((ok) => setTimeout(() => ok(fn()), RTT));
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  const text = typeof args[0] === 'string' ? args[0] : ((args[0] as { text?: string })?.text ?? '');
  const t = performance.now();
  queriesInOp++;
  const call = () => (origQuery as (...a: unknown[]) => unknown).apply(this, args);
  if (RTT > 0 && typeof args[args.length - 1] === 'function') {
    void later(call);
    return undefined;
  }
  const r = RTT > 0 ? later(call).then((x) => x) : call();
  if (r && typeof (r as Promise<unknown>).then === 'function') {
    const op = currentOp;
    (r as Promise<unknown>).then(
      () => {
        const ms = performance.now() - t;
        if (ms >= SLOW_MS) slow.push({ sql: text, ms, op });
      },
      () => {},
    );
  }
  return r;
} as typeof pg.Client.prototype.query;

async function main() {
  const { setRateLimiter } = await import('@/platform/rate-limit');
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
  const { getPool } = await import('@/platform/db');
  const pool = getPool();

  const profiles = await import('@/modules/profiles');
  const fence = await import('@/modules/fence');
  const notifications = await import('@/modules/notifications');
  const whispers = await import('@/modules/whispers');
  const relationships = await import('@/modules/relationships');
  const tracks = await import('@/modules/tracks');
  const townHalls = await import('@/modules/town-halls');
  const tributes = await import('@/modules/tributes');
  const marks = await import('@/modules/marks');
  const memories = await import('@/modules/memories');
  const capsules = await import('@/modules/capsules');
  const moderation = await import('@/modules/moderation');
  const social = await import('@/app/_lib/social');
  const suggestions = await import('@/modules/suggestions');

  // A typical person (median number of Pals) and a busy one (most cards on their Fence), plus one of each's Pals.
  const pick = async (sql: string) => (await pool.query(sql)).rows[0] as { id: string; handle: string };
  const busy = await pick(`select u.id, u.handle from users u join post_cards c on c.fence_owner_id = u.id
    group by u.id order by count(*) desc limit 1`);
  const typical =
    await pick(`select u.id, u.handle from users u join posse_links l on u.id in (l.user_low, l.user_high)
    group by u.id order by count(*) limit 1 offset 10000`);
  const palOf = async (id: string) =>
    pick(`select u.id, u.handle from posse_links l join users u on u.id = case when l.user_low = '${id}' then l.user_high else l.user_low end
      where '${id}' in (l.user_low, l.user_high) and l.status = 'accepted' limit 1`);
  const mod = await pick(`update users set role = 'moderator' where handle = 'user1' returning id, handle`);

  const results: { op: string; who: string; ms: number[]; queries: number }[] = [];
  async function time(op: string, who: string, fn: () => Promise<unknown>, runs = 5) {
    const ms: number[] = [];
    let q = 0;
    for (let i = 0; i < runs; i++) {
      currentOp = op;
      queriesInOp = 0;
      const t = performance.now();
      await fn();
      ms.push(performance.now() - t);
      q = queriesInOp;
    }
    results.push({ op, who, ms, queries: q });
  }

  for (const [who, me] of [
    ['typical', typical],
    ['busy', busy],
  ] as const) {
    const pal = await palOf(me.id);
    const actor = { kind: 'user' as const, id: me.id, status: 'active' as const };
    const palActor = { kind: 'user' as const, id: pal.id, status: 'active' as const };
    await time('home: own ranch', who, () => profiles.getOwnRanch(me.id));
    await time('home: memories', who, () => memories.memoriesToday(me.id));
    await time('shell: unread chimes', who, () => notifications.unreadCount(me.id));
    await time('shell: unread whispers', who, () => whispers.unreadThreads(me.id));
    await time('shell: town hall invites', who, () => townHalls.countMyInvites(me.id));
    await time('porch: ranch (self)', who, () =>
      profiles.getRanchForViewer(actor, me.handle, { rateKey: me.id }),
    );
    await time('porch: ranch (a Pal looking)', who, () =>
      profiles.getRanchForViewer(palActor, me.handle, { rateKey: pal.id }),
    );
    await time('porch: fence page 1 (self)', who, () =>
      fence.listFence(actor, me.handle, { rateKey: me.id }),
    );
    await time('porch: fence page 1 (a Pal)', who, () =>
      fence.listFence(palActor, me.handle, { rateKey: pal.id }),
    );
    await time('porch: tributes', who, () => tributes.listTributes(palActor, me.handle, { rateKey: pal.id }));
    await time('porch: vibe matrix', who, () =>
      marks.getVibeMatrix(palActor, me.handle, { rateKey: pal.id }),
    );
    await time('porch: waiting cards', who, () => fence.listWaiting(me.id));
    await time('chimes: page 1', who, () => notifications.listChimes(me.id, {}));
    await time('whispers: threads', who, () => whispers.listThreads(me.id));
    await time('whispers: one thread', who, () => whispers.getThread(me.id, pal.handle, {}));
    await time('pals: lists + names', who, () =>
      relationships.listMyRelationships(me.id).then((r) => social.withCards(r, me.id)),
    );
    await time('tracks', who, () => tracks.listTracks(me.id));
    await time('town halls: directory', who, () => townHalls.listDirectory(me.id, {}));
    await time('town halls: mine', who, () => townHalls.listMine(me.id));
    await time('capsules: mine', who, () => capsules.myCapsules(me.id));
    await time('pals: suggestions', who, () => suggestions.palSuggestions(me.id));
  }
  await time('moderation: queue', 'moderator', () => moderation.listQueue(mod.id, {}));

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
  const lines = results.map(
    (r) =>
      `${r.op.padEnd(32)} ${r.who.padEnd(9)} median ${median(r.ms).toFixed(1).padStart(7)} ms   max ${Math.max(
        ...r.ms,
      )
        .toFixed(1)
        .padStart(7)} ms   ${String(r.queries).padStart(3)} queries`,
  );
  const bySql = new Map<string, Q & { n: number }>();
  for (const q of slow) {
    const k = q.sql.replace(/\s+/g, ' ').slice(0, 400);
    const e = bySql.get(k);
    if (!e || e.ms < q.ms) bySql.set(k, { ...q, n: (e?.n ?? 0) + 1 });
    else e.n++;
  }
  const slowLines = [...bySql.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 25)
    .map(
      (q) =>
        `${q.ms.toFixed(1).padStart(7)} ms  x${q.n}  [${q.op}]\n    ${q.sql.replace(/\s+/g, ' ').slice(0, 600)}`,
    );
  const report = [
    `# ${process.argv[2] ?? 'run'}`,
    ...lines,
    '',
    `# statements >= ${SLOW_MS} ms`,
    ...slowLines,
  ].join('\n');
  writeFileSync(`.dev/perf/report-${process.argv[2] ?? 'run'}.txt`, report);
  process.stdout.write(`${report}
`);
  await pool.query(`update users set role = 'member' where handle = 'user1'`);
  await pool.end();
}

main().catch((e) => {
  process.stderr.write(`${String(e)}
`);
  process.exit(1);
});
