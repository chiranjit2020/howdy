import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recheckStaleTrust, recheckTrust, TRUST_RULES } from '@/modules/trust';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { giveMarkTo } from '../helpers/marks';
import { patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, insertUser, q, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const R = TRUST_RULES;

const olderBy = (id: string, days: number) =>
  q("update users set created_at = now() - ($2 || ' days')::interval where id = $1", [id, days]);

async function pal(a: string, b: string) {
  const [low, high] = a < b ? [a, b] : [b, a];
  await q(
    "insert into posse_links (user_low, user_high, status, requested_by, responded_at) values ($1, $2, 'accepted', $1, now())",
    [low, high],
  );
}
const mark = (rater: string, target: string, kind: string, daysAgo = 0) =>
  q(
    "insert into marks (rater_id, target_id, kind, created_at) values ($1, $2, $3, now() - ($4 || ' days')::interval)",
    [rater, target, kind, daysAgo],
  );
const seen = (id: string, daysAgo = 0) =>
  q(
    `insert into sessions (user_id, token_hash, last_seen_at, idle_expires_at, absolute_expires_at)
     values ($1, $2, now() - ($3 || ' days')::interval, now() + interval '1 day', now() + interval '1 day')`,
    [id, randomBytes(32), daysAgo],
  );
const portrait = (id: string) =>
  q("insert into media (owner_id, kind, status, object_key) values ($1, 'portrait', 'ready', $2)", [
    id,
    `portraits/${randomUUID()}.webp`,
  ]);

/**
 * A person who passes every check with nothing to spare: old enough, a Portrait, exactly enough Pals, Marks from exactly
 * enough (old enough) people across exactly enough kinds, seen recently. Returns their id and the givers' ids.
 */
async function qualified(owner?: { id: string; handle: string }) {
  const me = owner ?? (await insertUser('trust'));
  await olderBy(me.id, R.accountAgeDays + 1);
  await portrait(me.id);
  await seen(me.id);
  const givers: string[] = [];
  const kinds = ['gem', 'pure', 'gem', 'pure', 'chill'];
  for (let i = 0; i < R.minMarkGivers; i += 1) {
    const g = await insertUser('giver');
    await olderBy(g.id, R.giverMinAgeDays + 1);
    if (i < R.minPals) await pal(me.id, g.id);
    await mark(g.id, me.id, kinds[i]!);
    givers.push(g.id);
  }
  return { ...me, givers };
}

const failing = async (id: string) =>
  (await recheckTrust(id))!.checks.filter((c) => !c.met).map((c) => c.key);

describe('earning the Trusted tick', () => {
  it('is earned when every check passes, and stored', async () => {
    const p = await qualified();
    const s = await recheckTrust(p.id);
    expect(s).toMatchObject({ earned: true, team: false });
    const row = (await q('select earned_at from trust_ticks where user_id = $1', [p.id])).rows[0];
    expect(row.earned_at).not.toBeNull();
  });

  it('keeps the first earned date while it is held, and clears it when lost', async () => {
    const p = await qualified();
    const first = (await recheckTrust(p.id))!.earnedAt!;
    const again = (await recheckTrust(p.id, new Date(Date.now() + 60_000)))!.earnedAt!;
    expect(again.getTime()).toBe(first.getTime());
    await q('delete from media where owner_id = $1', [p.id]);
    expect(await recheckTrust(p.id)).toMatchObject({ earned: false, earnedAt: null });
  });

  it('a young account does not have it, however well liked', async () => {
    const p = await qualified();
    await olderBy(p.id, R.accountAgeDays - 1);
    expect(await failing(p.id)).toEqual(['age']);
  });
});

describe('Marks that do not count', () => {
  it('many Marks from ONE person count as one giver', async () => {
    const p = await qualified();
    // Swap the last giver's Mark for a pile of Marks from someone who already gave one.
    await q('delete from marks where rater_id = $1', [p.givers.at(-1)]);
    for (let i = 0; i < 6; i += 1) await mark(p.givers[0]!, p.id, 'chill', 40 * i);
    expect(await failing(p.id)).toEqual(['markGivers']);
  });

  it('a Mark from an account younger than the giver minimum does not count yet', async () => {
    const p = await qualified();
    await olderBy(p.givers[0]!, R.giverMinAgeDays - 1);
    expect(await failing(p.id)).toContain('markGivers');
    await olderBy(p.givers[0]!, R.giverMinAgeDays + 1);
    expect(await failing(p.id)).toEqual([]);
  });

  it('a Mark from a suspended account does not count', async () => {
    const p = await qualified();
    await q("update users set status = 'suspended' where id = $1", [p.givers.at(-1)]);
    expect(await failing(p.id)).toContain('markGivers');
  });

  it('a Mark older than the window stops counting', async () => {
    const p = await qualified();
    await q("update marks set created_at = now() - ($2 || ' days')::interval where rater_id = $1", [
      p.givers.at(-1),
      R.markWindowDays + 1,
    ]);
    expect(await failing(p.id)).toContain('markGivers');
  });

  it('five people all giving the same kind is not a spread', async () => {
    const p = await qualified();
    await q("update marks set kind = 'gem' where target_id = $1", [p.id]);
    expect(await failing(p.id)).toEqual(['markKinds']);
  });
});

describe('standing and activity', () => {
  it('an OPEN report changes nothing (anyone can file one); an UPHELD one takes the tick away', async () => {
    const p = await qualified();
    const reporter = p.givers[0]!;
    await q("insert into reports (reporter_id, target_user_id, reason) values ($1, $2, 'spam')", [
      reporter,
      p.id,
    ]);
    expect(await failing(p.id)).toEqual([]);
    await q("update reports set status = 'actioned', reviewed_at = now() where target_user_id = $1", [p.id]);
    expect(await failing(p.id)).toEqual(['standing']);
    // It stops counting once it is old enough.
    await q("update reports set reviewed_at = now() - ($2 || ' days')::interval where target_user_id = $1", [
      p.id,
      R.standingDays + 1,
    ]);
    expect(await failing(p.id)).toEqual([]);
  });

  it('a quiet spell loses it; losing a Pal loses it', async () => {
    const p = await qualified();
    await q("update sessions set last_seen_at = now() - ($2 || ' days')::interval where user_id = $1", [
      p.id,
      R.activeWithinDays + 1,
    ]);
    expect(await failing(p.id)).toEqual(['active']);
    await seen(p.id);
    await q('delete from posse_links where user_low = $1 or user_high = $1', [p.givers[0]]);
    expect(await failing(p.id)).toEqual(['pals']);
  });

  it('a Pal whose account is no longer active does not count as a Pal', async () => {
    const p = await qualified();
    await q("update users set status = 'suspended' where id = $1", [p.givers[0]]);
    expect(await failing(p.id)).toContain('pals');
  });
});

describe('the team account', () => {
  it('never earns the Trusted tick: it already carries Verified', async () => {
    const p = await qualified();
    await q("update users set role = 'admin' where id = $1", [p.id]);
    expect(await recheckTrust(p.id)).toMatchObject({ earned: false, team: true });
  });

  it('shows Verified and never the Trusted tick, even with a stored tick from before it became the team', async () => {
    const owner = await signedInUser(kit, uniqueUser('team'));
    const id = await userId(owner.handle);
    await qualified({ id, handle: owner.handle });
    await recheckTrust(id);
    await q("update users set role = 'admin' where id = $1", [id]);
    const view = await viewRanch(owner.handle);
    expect(view.data.ranch).toMatchObject({ verified: true, trusted: false });
  });
});

describe('what other people see', () => {
  it('the Porch says `trusted` once earned, and nothing about why', async () => {
    const owner = await signedInUser(kit, uniqueUser('owner'));
    await patchRanch({ ranchVisibility: 'everyone' }, { cookie: owner.cookie });
    const id = await userId(owner.handle);
    const before = await viewRanch(owner.handle);
    expect(before.data.ranch?.trusted).toBe(false);
    await qualified({ id, handle: owner.handle });
    await recheckTrust(id);
    const after = await viewRanch(owner.handle);
    expect(after.data.ranch?.trusted).toBe(true);
    // No checklist, counts or dates leak onto the public view.
    expect(after.text).not.toMatch(/checks|earnedAt|markGivers|standing/);
  });

  it('a visit re-checks a stale decision, so a lost tick disappears without a job', async () => {
    const owner = await signedInUser(kit, uniqueUser('owner'));
    const visitor = await signedInUser(kit, uniqueUser('visitor'));
    await patchRanch({ ranchVisibility: 'everyone' }, { cookie: owner.cookie });
    const id = await userId(owner.handle);
    await qualified({ id, handle: owner.handle });
    await recheckTrust(id);
    await q('delete from media where owner_id = $1', [id]);
    // Fresh decision: the visit does not re-check yet.
    await viewRanch(owner.handle, { cookie: visitor.cookie });
    await flushBackground();
    expect((await viewRanch(owner.handle)).data.ranch?.trusted).toBe(true);
    // Stale: it does.
    await q("update trust_ticks set checked_at = now() - interval '7 hours' where user_id = $1", [id]);
    await viewRanch(owner.handle, { cookie: visitor.cookie });
    await flushBackground();
    expect((await viewRanch(owner.handle)).data.ranch?.trusted).toBe(false);
  });

  it('a new Mark re-checks the person who received it', async () => {
    const owner = await signedInUser(kit, uniqueUser('owner'));
    const friend = await signedInUser(kit, uniqueUser('friend'));
    await patchRanch({ ranchVisibility: 'everyone' }, { cookie: owner.cookie });
    await doAct(owner.handle, 'request', { cookie: friend.cookie });
    await doAct(friend.handle, 'accept', { cookie: owner.cookie });
    const id = await userId(owner.handle);
    await flushBackground();
    await q('delete from trust_ticks where user_id = $1', [id]);
    expect((await giveMarkTo(owner.handle, 'gem', { cookie: friend.cookie })).status).toBe(201);
    await flushBackground();
    expect((await q('select 1 from trust_ticks where user_id = $1', [id])).rowCount).toBe(1);
  });

  it('the daily job re-checks decisions more than a day old', async () => {
    const p = await qualified();
    await recheckTrust(p.id);
    await q('delete from media where owner_id = $1', [p.id]);
    await q("update trust_ticks set checked_at = now() - interval '2 days' where user_id = $1", [p.id]);
    const { trustRechecked } = await recheckStaleTrust();
    expect(trustRechecked).toBeGreaterThanOrEqual(1);
    expect(
      (await q('select earned_at from trust_ticks where user_id = $1', [p.id])).rows[0].earned_at,
    ).toBeNull();
  });
});
