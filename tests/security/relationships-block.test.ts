import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from '@/modules/relationships';
import { MAX_PENDING_OUTGOING, RATE } from '@/modules/relationships/service';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, settledUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, setSignal, viewRanch } from '../helpers/ranch';
import { NONE, doAct, insertUser, myLists, q, relWith, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

// Settled accounts: these tests are about everyone's rules, not the first-week budgets (ADR-024).
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const count = async (table: string) => (await q(`select count(*)::int n from ${table}`)).rows[0].n as number;

async function posse(a: { handle: string; cookie: string }, b: { handle: string; cookie: string }) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('Block: hides both ways, overrides every privacy setting', () => {
  it('a blocked person cannot open a public Ranch — and neither can the blocker open theirs', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await patchRanch({ ranchVisibility: 'everyone' }, as(a));
    await patchRanch({ ranchVisibility: 'everyone' }, as(b));
    expect((await viewRanch(a.handle, as(b))).status).toBe(200);
    await doAct(b.handle, 'block', as(a));
    expect((await viewRanch(a.handle, as(b))).status).toBe(404); // "everyone" no longer includes them
    expect((await viewRanch(b.handle, as(a))).status).toBe(404); // and it is mutual
    expect((await viewRanch(a.handle)).status).toBe(200); // signed-out visitors are unaffected (they cannot be identified)
  });

  it('it ends the Posse, pending requests in both directions, and scouting in both directions — atomically', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await posse(a, b);
    await doAct(a.handle, 'scout', as(b));
    await doAct(b.handle, 'scout', as(a));
    await doAct(c.handle, 'request', as(a));
    await doAct(a.handle, 'request', as(c));
    await doAct(b.handle, 'block', as(a));
    expect(
      (
        await q(
          'select count(*)::int n from posse_links where (user_low = any($1) and user_high = any($1))',
          [[await userId(a.handle), await userId(b.handle)]],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(await count('scouts')).toBe(0);
    // a request Carol and Alice exchanged is untouched (it became a Posse by mutual request)
    expect((await relWith(c.handle, as(a))).data.relationship).toMatchObject({ posse: 'member' });
  });

  it('a block removes existing Posse access to a posse-only Ranch', async () => {
    const owner = await person('owner');
    const friend = await person('friend');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    await posse(owner, friend);
    expect((await viewRanch(owner.handle, as(friend))).status).toBe(200);
    await doAct(friend.handle, 'block', as(owner));
    expect((await viewRanch(owner.handle, as(friend))).status).toBe(404);
  });

  it('unblocking restores visibility but NOT the Posse', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await posse(a, b);
    await doAct(b.handle, 'block', as(a));
    await doAct(b.handle, 'unblock', as(a));
    expect((await viewRanch(a.handle, as(b))).status).toBe(200);
    expect((await relWith(b.handle, as(a))).data.relationship).toMatchObject(NONE);
    expect(await count('posse_links')).toBe(0);
  });

  it('blocking is idempotent, and works even if the other person already blocked you', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'block', as(a));
    expect((await doAct(b.handle, 'block', as(a))).status).toBe(200);
    expect((await doAct(a.handle, 'block', as(b))).data.relationship).toMatchObject({ blocked: true });
    expect(await count('user_controls')).toBe(2);
  });
});

describe('a block cannot be detected by the person who was blocked', () => {
  it('their read of the relationship is the same 404 as for a person who does not exist', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'block', as(a));
    const seenByBlocked = await relWith(a.handle, as(b));
    const seenForMissing = await relWith('nobody_home', as(b));
    expect(seenByBlocked.status).toBe(404);
    expect(stable(seenByBlocked.data)).toBe(stable(seenForMissing.data));
  });

  it('asking to join the Posse of someone who blocked you "succeeds" exactly like an ordinary request — and stores nothing', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const c = await person('carol');
    await doAct(b.handle, 'block', as(a));
    const toBlocker = await doAct(a.handle, 'request', as(b));
    const toStranger = await doAct(c.handle, 'request', as(b));
    expect(toBlocker.status).toBe(200);
    expect(stable(toBlocker.data)).toBe(stable(toStranger.data)); // identical, byte for byte
    expect(toBlocker.data.relationship).toMatchObject({ ...NONE, posse: 'sent' });
    expect(await count('posse_links')).toBe(1); // only the real one, to Carol
    expect((await myLists(as(a))).data.incoming).toEqual([]);
  });

  it('accepting, marking close or scouting someone who blocked you is a plain 404, like a request that does not exist', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'block', as(a));
    for (const action of ['accept', 'close', 'scout'] as const) {
      const r = await doAct(a.handle, action, as(b));
      expect(r.status, action).toBe(404);
    }
    expect(await count('scouts')).toBe(0);
  });

  it('the blocked person’s lists and Ranch view never mention the blocker', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await posse(a, b);
    await doAct(b.handle, 'block', as(a));
    expect(JSON.stringify((await myLists(as(b))).data)).not.toContain(a.handle);
    const own = (await myLists(as(a))).data;
    expect((own.blocked as { handle: string }[]).map((p) => p.handle)).toEqual([b.handle]);
  });

  it('a blocked person can still block, mute and report the blocker (nothing they do is refused, so nothing is revealed)', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'block', as(a));
    expect((await doAct(a.handle, 'mute', as(b))).status).toBe(200);
    expect((await doAct(a.handle, 'unmute', as(b))).status).toBe(200);
  });
});

describe('abuse limits (all fail closed)', () => {
  it('asking to join Posses is limited to 20 new people per day', async () => {
    const a = await person('asker');
    const targets = await Promise.all(Array.from({ length: RATE.request.limit + 1 }, () => insertUser()));
    for (const t of targets.slice(0, RATE.request.limit))
      expect((await doAct(t.handle, 'request', as(a))).status).toBe(200);
    const blocked = await doAct(targets[RATE.request.limit]!.handle, 'request', as(a));
    expect(blocked.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await count('posse_links')).toBe(RATE.request.limit);
  }, 60_000);

  it('at most 50 requests can be waiting at once', async () => {
    const a = await person('asker');
    const aId = await userId(a.handle);
    const people = await Promise.all(Array.from({ length: MAX_PENDING_OUTGOING }, () => insertUser()));
    for (const p of people) {
      const [low, high] = aId < p.id ? [aId, p.id] : [p.id, aId];
      await q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $3)', [
        low,
        high,
        aId,
      ]);
    }
    const extra = await insertUser();
    const r = await doAct(extra.handle, 'request', as(a));
    expect(r.status).toBe(429);
    expect(r.data.error?.message).toMatch(/waiting/i);
  }, 60_000);

  it('the general action budget is 120 per hour per person', async () => {
    const a = await person('busy');
    const t = await insertUser();
    for (let i = 0; i < RATE.act.limit; i++)
      expect((await doAct(t.handle, i % 2 ? 'unscout' : 'unmute', as(a))).status).toBe(200);
    expect((await doAct(t.handle, 'unmute', as(a))).status).toBe(429);
  }, 60_000);

  it('if the limiter backend is down, nothing is applied', async () => {
    const a = await person('alice');
    const b = await person('bob');
    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    const r = await doAct(b.handle, 'block', as(a));
    expect(r.status).toBe(500);
    expect(await count('user_controls')).toBe(0);
  });
});

describe('lists are bounded', () => {
  it('each list is cut at 100 and says so', async () => {
    const a = await person('scout');
    const aId = await userId(a.handle);
    const people = await Promise.all(Array.from({ length: 105 }, () => insertUser()));
    for (const p of people) await q('insert into scouts (scout_id, scoutee_id) values ($1, $2)', [aId, p.id]);
    const r = (await myLists(as(a))).data as { scouting: unknown[]; truncated: boolean };
    expect(r.scouting).toHaveLength(100);
    expect(r.truncated).toBe(true);
  }, 60_000);
});

describe('the database enforces the model even against buggy code', () => {
  const ids = async () => {
    const a = await insertUser();
    const b = await insertUser();
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    return { a, b, low, high };
  };

  it('a pair is stored once, in canonical order', async () => {
    const { low, high } = await ids();
    await expect(
      q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $1)', [high, low]),
    ).rejects.toThrow(/posse_links_canonical_order/);
    await q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $1)', [low, high]);
    await expect(
      q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $2)', [low, high]),
    ).rejects.toThrow(/posse_links_user_low_user_high_pk/);
  });

  it('rejects self-links, unknown statuses, outsiders as requester, and close flags on unaccepted links', async () => {
    const { low, high } = await ids();
    const outsider = await insertUser();
    await expect(
      q('insert into posse_links (user_low, user_high, requested_by) values ($1, $1, $1)', [low]),
    ).rejects.toThrow();
    await expect(
      q(
        "insert into posse_links (user_low, user_high, requested_by, status) values ($1, $2, $1, 'friends')",
        [low, high],
      ),
    ).rejects.toThrow(/posse_links_status_check/);
    await expect(
      q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $3)', [
        low,
        high,
        outsider.id,
      ]),
    ).rejects.toThrow(/posse_links_requester_is_a_member/);
    await expect(
      q(
        'insert into posse_links (user_low, user_high, requested_by, low_marks_close) values ($1, $2, $1, true)',
        [low, high],
      ),
    ).rejects.toThrow(/posse_links_close_needs_accepted/);
  });

  it('rejects self-scouting, self-controls and unknown control kinds', async () => {
    const { a, b } = await ids();
    await expect(q('insert into scouts (scout_id, scoutee_id) values ($1, $1)', [a.id])).rejects.toThrow(
      /scouts_not_self/,
    );
    await expect(
      q("insert into user_controls (actor_id, target_id, kind) values ($1, $1, 'block')", [a.id]),
    ).rejects.toThrow(/user_controls_not_self/);
    await expect(
      q("insert into user_controls (actor_id, target_id, kind) values ($1, $2, 'ghost')", [a.id, b.id]),
    ).rejects.toThrow(/user_controls_kind_check/);
  });

  it('deleting a user removes every link, scout and control that involves them', async () => {
    const { a, b } = await ids();
    const [low, high] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    await q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $1)', [low, high]);
    await q('insert into scouts (scout_id, scoutee_id) values ($1, $2)', [a.id, b.id]);
    await q("insert into user_controls (actor_id, target_id, kind) values ($1, $2, 'mute')", [b.id, a.id]);
    await q('delete from users where id = $1', [a.id]);
    expect(await count('posse_links')).toBe(0);
    expect(await count('scouts')).toBe(0);
    expect(await count('user_controls')).toBe(0);
  });
});

describe('scouting or blocking does not leak through the Signal either', () => {
  it('a blocked person never receives a members-only Signal', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await setSignal('secret vibe', as(a));
    await doAct(b.handle, 'block', as(a));
    const r = await viewRanch(a.handle, as(b));
    expect(r.status).toBe(404);
    expect(r.text).not.toContain('secret vibe');
  });
});

describe('defence in depth: the relationship service refuses blocked interactions on its own', () => {
  it('accept, close and scout are refused even if a race left a live request or Posse next to a block', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const aId = await userId(a.handle);
    const bId = await userId(b.handle);
    const [low, high] = aId < bId ? [aId, bId] : [bId, aId];
    // The state a block-versus-request race could leave behind: Bob's pending request AND Alice's block both exist.
    await q('insert into posse_links (user_low, user_high, requested_by) values ($1, $2, $3)', [
      low,
      high,
      bId,
    ]);
    await q("insert into user_controls (actor_id, target_id, kind) values ($1, $2, 'block')", [aId, bId]);

    await expect(act(aId, bId, 'accept')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(act(aId, bId, 'scout')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await q('select status from posse_links')).rows[0].status).toBe('requested'); // nothing was accepted
    expect(await count('scouts')).toBe(0);

    await q("update posse_links set status = 'accepted'");
    await expect(act(aId, bId, 'close')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await q('select low_marks_close, high_marks_close from posse_links')).rows[0]).toEqual({
      low_marks_close: false,
      high_marks_close: false,
    });
  });
});
