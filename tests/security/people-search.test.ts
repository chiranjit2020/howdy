import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as searchRoute } from '@/app/api/people/search/route';
import { getPool } from '@/platform/db';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { patchRanch } from '../helpers/ranch';
import { doAct } from '../helpers/social';

/**
 * People search must find only people who chose to be found (plus your own friends), and never anyone with a block or
 * mute between you, a profile you could not open, or a whole list of people through wildcard tricks.
 */
let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
type P = Awaited<ReturnType<typeof person>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const findable = (p: P) => patchRanch({ searchable: true, ranchVisibility: 'members' }, as(p));

const search = async (who: P, q: string) => {
  const r = await call(
    searchRoute,
    'GET',
    `/api/people/search?q=${encodeURIComponent(q)}`,
    undefined,
    as(who),
  );
  return {
    status: r.status,
    handles: ((r.data.people ?? []) as { handle: string }[]).map((p) => p.handle),
    text: r.text,
  };
};

describe('people search', () => {
  it('finds nobody who has not chosen to be found: it is off by default, even for an exact @username', async () => {
    const me = await person('seeker');
    const quiet = await person('quietone');
    expect((await search(me, quiet.handle)).handles).toEqual([]);
    expect((await search(me, `@${quiet.handle}`)).handles).toEqual([]);
  });

  it('finds people who switched it on, by the start of their username', async () => {
    const me = await person('seeker');
    const open = await person('openbook');
    await findable(open);
    const found = await search(me, open.handle.slice(0, 5));
    expect(found.handles).toContain(open.handle);
    expect(found.text).not.toMatch(/"id"|email/); // names and usernames only: never an id or an email
  });

  it('always finds my own friends, whatever their setting', async () => {
    const me = await person('seeker');
    const pal = await person('palofmine');
    await doAct(pal.handle, 'request', as(me));
    await doAct(me.handle, 'accept', as(pal));
    expect((await search(me, pal.handle)).handles).toEqual([pal.handle]);
  });

  it('never shows anyone with a block or mute between us, in either direction', async () => {
    const me = await person('seeker');
    const a = await person('blocksme');
    const b = await person('iblockthem');
    const c = await person('imutethem');
    for (const p of [a, b, c]) await findable(p);
    await doAct(me.handle, 'block', as(a));
    await doAct(b.handle, 'block', as(me));
    await doAct(c.handle, 'mute', as(me));
    for (const p of [a, b, c]) expect((await search(me, p.handle)).handles).not.toContain(p.handle);
  });

  it('never shows someone whose profile I could not open, even if they are findable', async () => {
    const me = await person('seeker');
    const closed = await person('closedranch');
    await patchRanch({ searchable: true, ranchVisibility: 'posse' }, as(closed));
    expect((await search(me, closed.handle)).handles).toEqual([]);
  });

  it('treats % and _ as plain characters, so a wildcard cannot list everyone', async () => {
    const me = await person('seeker');
    const open = await person('openbook');
    await findable(open);
    for (const q of ['%%', '__', '%_', '\\%']) expect((await search(me, q)).handles).toEqual([]);
  });

  it('needs at least two characters, a signed-in person, and a short query', async () => {
    const me = await person('seeker');
    expect((await search(me, 'a')).handles).toEqual([]);
    expect((await call(searchRoute, 'GET', '/api/people/search?q=ab')).status).toBe(401);
    expect((await search(me, 'x'.repeat(61))).status).toBe(400);
  });
});
