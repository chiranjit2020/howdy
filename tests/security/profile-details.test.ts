import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as getMine, PATCH as patchMine } from '@/app/api/me/details/route';
import { detailsForViewer } from '@/modules/profiles';
import { getPool } from '@/platform/db';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q, userId } from '../helpers/social';

/** Personal details on a profile: what may be saved, and who sees each detail (decided at read time). */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: P) => ({ cookie: p.cookie });
const patch = (body: unknown, who?: P) =>
  call(patchMine, 'PATCH', '/api/me/details', body, who ? as(who) : {});
const mine = (who: P) => call(getMine, 'GET', '/api/me/details', undefined, as(who));
const keys = (lines: { key: string }[]) => lines.map((l) => l.key);

async function friends(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

/** An owner with one detail for each audience. */
async function owner() {
  const o = await person('owner');
  const res = await patch(
    {
      livesIn: 'Kolkata',
      work: 'Designer at a studio',
      birthday: { day: 12, month: 3 },
      audience: { livesIn: 'members', work: 'posse', birthday: 'only_me' },
    },
    o,
  );
  expect(res.status).toBe(200);
  return { o, id: await userId(o.handle) };
}

describe('saving details', () => {
  it('needs a session; saves only what is given; null or "" clears; a new detail is for friends', async () => {
    expect((await patch({ livesIn: 'Kolkata' })).status).toBe(401);
    const a = await person('saver');
    await patch({ livesIn: '  Kolkata   West ', relationship: 'married' }, a);
    let d = (await mine(a)).data.details as Record<string, unknown>;
    expect(d).toMatchObject({ livesIn: 'Kolkata West', relationship: 'married', work: null });
    expect((d.audience as Record<string, string>).livesIn).toBe('posse');
    await patch({ work: 'Teacher' }, a); // leaves the others alone
    await patch({ livesIn: '', relationship: null }, a);
    d = (await mine(a)).data.details as Record<string, unknown>;
    expect(d).toMatchObject({ livesIn: null, relationship: null, work: 'Teacher' });
  });

  it('refuses links, disguising characters, long text, impossible birthdays and unknown choices', async () => {
    const a = await person('strict');
    for (const body of [
      { work: 'Hire me at example.com' },
      { work: 'https://x.y' },
      { hometown: 'Siliguri\u202Etxt' },
      { education: 'x'.repeat(61) },
      { birthday: { day: 30, month: 2 } },
      { birthday: { day: 0, month: 1 } },
      { birthday: { day: 12, month: 13 } },
      { relationship: 'situationship' },
      { audience: { work: 'everyone' } },
      {},
    ])
      expect((await patch(body, a)).status, JSON.stringify(body)).toBe(422);
    expect((await patch({ birthday: { day: 29, month: 2 } }, a)).status).toBe(200); // a leap-day birthday is real
  });

  it('cannot reach anyone else: there is no id, and unknown keys are dropped', async () => {
    const a = await person('alpha');
    const b = await person('bravo');
    await patch({ livesIn: 'Delhi', userId: await userId(b.handle), user_id: await userId(b.handle) }, a);
    expect((await mine(b)).data.details).toMatchObject({ livesIn: null });
    expect((await mine(a)).data.details).toMatchObject({ livesIn: 'Delhi' });
  });

  it('the database refuses what the app would (defence in depth)', async () => {
    const a = await person('db');
    const id = await userId(a.handle);
    for (const [col, value] of [
      ['lives_in', 'x'.repeat(61)],
      ['work', 'line\u0007bell'],
      ['relationship', 'situationship'],
      ['work_audience', 'everyone'],
    ] as const)
      await expect(
        q(`insert into profile_details (user_id, ${col}) values ($1, $2)`, [id, value]),
        col,
      ).rejects.toThrow(/profile_details_/);
    await expect(
      q('insert into profile_details (user_id, birthday_day) values ($1, 5)', [id]),
    ).rejects.toThrow(/birthday_pair/);
  });
});

describe('who sees what', () => {
  it('the owner sees every detail with its audience', async () => {
    const { id } = await owner();
    const lines = await detailsForViewer(id, id);
    expect(lines).toEqual([
      { key: 'livesIn', text: 'Kolkata', audience: 'members' },
      { key: 'work', text: 'Designer at a studio', audience: 'posse' },
      { key: 'birthday', text: '12 March', audience: 'only_me' },
    ]);
  });

  it('a signed-in stranger sees "Everyone on Howdy" only; signed out, nothing; nobody else gets audiences', async () => {
    const { id } = await owner();
    const stranger = await person('stranger');
    const lines = await detailsForViewer(await userId(stranger.handle), id);
    expect(lines).toEqual([{ key: 'livesIn', text: 'Kolkata' }]);
    expect(await detailsForViewer(null, id)).toEqual([]);
  });

  it('a friend also sees "Friends" details, and stops seeing them after parting ways; "Only me" never', async () => {
    const { o, id } = await owner();
    const f = await person('friend');
    await friends(o, f);
    const fid = await userId(f.handle);
    expect(keys(await detailsForViewer(fid, id))).toEqual(['livesIn', 'work']);
    await doAct(o.handle, 'leave', as(f));
    expect(keys(await detailsForViewer(fid, id))).toEqual(['livesIn']);
  });

  it('a block either way hides every detail, even "Everyone on Howdy" ones', async () => {
    const { o, id } = await owner();
    const x = await person('blocked');
    const xid = await userId(x.handle);
    await doAct(x.handle, 'block', as(o));
    expect(await detailsForViewer(xid, id)).toEqual([]);
    await doAct(x.handle, 'unblock', as(o));
    await doAct(o.handle, 'block', as(x));
    expect(await detailsForViewer(xid, id)).toEqual([]);
  });

  it('deleting the account deletes the details', async () => {
    const { id } = await owner();
    await q('delete from users where id = $1', [id]);
    expect((await q('select count(*)::int n from profile_details where user_id = $1', [id])).rows[0].n).toBe(
      0,
    );
  });
});
