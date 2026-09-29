import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as askRoute } from '@/app/api/pals/ask/route';
import { getPool } from '@/platform/db';
import { MAX_PENDING_OUTGOING, RATE } from '@/modules/relationships/service';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, settledUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, insertUser, myLists, q, userId } from '../helpers/social';

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
const ask = (handle: unknown, opts: { cookie?: string; origin?: string | null } = {}) =>
  call(askRoute, 'POST', '/api/pals/ask', { handle }, opts);
const links = async () => (await q('select count(*)::int n from posse_links')).rows[0].n as number;

describe('Ask by call sign (the way in to a private Ranch)', () => {
  it('reaches a posse-only Ranch that the asker cannot even open', async () => {
    const owner = await person('owner');
    const asker = await person('asker');
    await patchRanch({ ranchVisibility: 'posse' }, as(owner));
    expect((await viewRanch(owner.handle, as(asker))).status).toBe(404); // no button to click...
    expect((await ask(owner.handle, as(asker))).status).toBe(202); // ...but they can still ask
    expect((await myLists(as(owner))).data.incoming).toEqual([
      expect.objectContaining({ handle: asker.handle }),
    ]);
    await doAct(asker.handle, 'accept', as(owner));
    expect((await viewRanch(owner.handle, as(asker))).status).toBe(200);
  });

  it('answers identically whether the person exists, is suspended, blocked you, or is you', async () => {
    const a = await person('alice');
    const real = await person('real');
    const blocker = await person('blocker');
    const suspended = await person('suspended');
    await doAct(a.handle, 'block', as(blocker));
    await q("update users set status = 'suspended' where handle = $1", [suspended.handle]);

    const answers = await Promise.all(
      [real.handle, 'nobody_home', blocker.handle, suspended.handle, a.handle, real.handle.toUpperCase()].map(
        (h) => ask(h, as(a)),
      ),
    );
    for (const r of answers) {
      expect(r.status).toBe(202);
      expect(stable(r.data)).toBe(stable(answers[0]!.data));
    }
    // ...but only the genuine one had any effect
    expect(await links()).toBe(1);
    expect((await myLists(as(real))).data.incoming).toEqual([expect.objectContaining({ handle: a.handle })]);
    expect((await myLists(as(blocker))).data.incoming).toEqual([]);
  });

  it('repeating it is harmless, and a declined request stays silent', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await ask(b.handle, as(a));
    await ask(b.handle, as(a));
    expect(await links()).toBe(1);
    await doAct(a.handle, 'decline', as(b));
    expect((await ask(b.handle, as(a))).status).toBe(202); // cooldown: nothing changes, nothing is revealed
    expect((await myLists(as(b))).data.incoming).toEqual([]);
  });

  it('validates the call sign shape before doing anything', async () => {
    const a = await person('alice');
    for (const bad of ['', 'ab', '../etc', 'a b', "x'; drop table users;--", 42, null, undefined]) {
      expect((await ask(bad, as(a))).status, JSON.stringify(bad)).toBe(422);
    }
    expect(await links()).toBe(0);
  });

  it('scanning call signs spends the same daily budget as real asks (20 a day), and fails closed', async () => {
    const a = await person('scanner');
    for (let i = 0; i < RATE.request.limit; i++)
      expect((await ask(`ghost_${i}_zzzz`, as(a))).status).toBe(202);
    const over = await ask('ghost_over_zzzz', as(a));
    expect(over.status).toBe(429);
    expect(over.res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(await links()).toBe(0); // nothing was real

    const b = await person('bob');
    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    expect((await ask('someone_else', as(b))).status).toBe(500);
    expect(await links()).toBe(0);
  }, 90_000);

  /** Someone at their limit must not be able to tell a real, blocking, declining or missing target apart. */
  async function targetsOfEveryKind(a: { handle: string; cookie: string }) {
    const real = await person('real');
    const blocker = await person('blocker');
    const decliner = await person('decliner');
    const suspended = await person('suspended');
    await doAct(a.handle, 'block', as(blocker));
    await ask(decliner.handle, as(a));
    await doAct(a.handle, 'decline', as(decliner));
    await q("update users set status = 'suspended' where handle = $1", [suspended.handle]);
    return {
      real: real.handle,
      blocker: blocker.handle,
      decliner: decliner.handle,
      suspended: suspended.handle,
      missing: 'nobody_home',
    };
  }

  it('at the DAILY limit every kind of target gets the same 429 — no way to spot a block or a decline', async () => {
    const a = await person('alice');
    const t = await targetsOfEveryKind(a);
    // burn what is left of today's budget on ghosts
    for (let i = 0; i < RATE.request.limit; i++) {
      const r = await ask(`burn_${i}_zzzz`, as(a));
      if (r.status === 429) break;
    }
    const answers = await Promise.all(Object.values(t).map((h) => ask(h, as(a))));
    for (const r of answers) {
      expect(r.status).toBe(429);
      expect(stable(r.data)).toBe(stable(answers[0]!.data));
    }
  }, 90_000);

  it('at the WAITING cap (50 pending) every kind of target gets the same 429 too', async () => {
    const a = await person('alice');
    const t = await targetsOfEveryKind(a);
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
    setRateLimiter(new MemoryRateLimiter()); // the daily budget is not what is being tested here
    const answers = await Promise.all(Object.values(t).map((h) => ask(h, as(a))));
    for (const r of answers) {
      expect(r.status).toBe(429);
      expect(stable(r.data)).toBe(stable(answers[0]!.data));
    }
  }, 90_000);

  it('the daily new-request cap still applies to people found this way', async () => {
    const a = await person('asker');
    const targets = await Promise.all(Array.from({ length: 21 }, () => insertUser()));
    for (const t of targets.slice(0, 20)) expect((await ask(t.handle, as(a))).status).toBe(202);
    expect((await ask(targets[20]!.handle, as(a))).status).toBe(429);
    expect(await links()).toBe(20);
    expect(await userId(targets[0]!.handle)).toBeTruthy();
  }, 90_000);

  it('needs a signed-in caller, and cross-site requests do nothing (CSRF)', async () => {
    const a = await person('alice');
    const b = await person('bob');
    expect((await ask(b.handle)).status).toBe(401);
    expect((await ask(b.handle, { cookie: a.cookie, origin: 'https://evil.example' })).status).toBe(403);
    expect(await links()).toBe(0);
  });
});
