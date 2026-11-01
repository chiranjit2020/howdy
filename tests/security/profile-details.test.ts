import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as getMine, PATCH as patchMine } from '@/app/api/me/details/route';
import { detailsForViewer } from '@/modules/profiles';
import { SOCIAL_PATTERN } from '@/shared/validation/details';
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

describe('ways to reach you (ADR-058)', () => {
  it('tidies what is typed: https added, email lower-cased, a pasted profile link becomes its handle', async () => {
    const a = await person('reach');
    const res = await patch(
      {
        website: 'Example.com/Portfolio',
        email: '  Me@Example.COM ',
        phone: '+91  98765 43210',
        socials: {
          instagram: '@asha.rao',
          linkedin: 'https://www.linkedin.com/in/asha-rao/',
          x: 'twitter.com/asha_r',
          youtube: 'youtube.com/@ashamakes',
          facebook: 'm.facebook.com/asha.rao.9',
        },
      },
      a,
    );
    expect(res.status).toBe(200);
    expect(res.data.details).toMatchObject({
      website: 'https://example.com/Portfolio',
      email: 'me@example.com',
      phone: '+91 98765 43210',
      socials: {
        instagram: 'asha.rao',
        linkedin: 'asha-rao',
        x: 'asha_r',
        youtube: 'ashamakes',
        facebook: 'asha.rao.9',
      },
    });
    // Each social link is built by Howdy, to the real site only.
    const id = await userId(a.handle);
    const hrefs = Object.fromEntries((await detailsForViewer(id, id)).map((l) => [l.key, l.href]));
    expect(hrefs).toMatchObject({
      website: 'https://example.com/Portfolio',
      email: 'mailto:me@example.com',
      phone: 'tel:+919876543210',
      instagram: 'https://www.instagram.com/asha.rao/',
      linkedin: 'https://www.linkedin.com/in/asha-rao/',
      x: 'https://x.com/asha_r',
      youtube: 'https://www.youtube.com/@ashamakes',
      facebook: 'https://www.facebook.com/asha.rao.9',
    });
    await patch({ website: '', socials: { x: null } }, a);
    expect((await mine(a)).data.details).toMatchObject({
      website: null,
      socials: { x: null, instagram: 'asha.rao' },
    });
  });

  it('refuses unsafe links, other sites passed off as a social profile, and bad emails or numbers', async () => {
    const a = await person('unsafe');
    for (const body of [
      { website: 'http://example.com' },
      { website: 'javascript:alert(1)' },
      { website: 'data:text/html,hi' },
      { website: 'https://user:pass@example.com' },
      { website: 'https://192.168.1.1/admin' },
      { website: 'https://localhost' },
      { website: 'https://exa mple.com' },
      { website: `https://example.com/${'a'.repeat(200)}` },
      { website: 'https://example.com/\u202Egpj.exe' },
      { email: 'not-an-email' },
      { email: 'a@b@c.com' },
      { phone: 'call me maybe' },
      { phone: '12345' },
      { phone: '+1 234 567 890 123 456 78' },
      { socials: { instagram: 'https://evil.example/asha' } },
      { socials: { instagram: 'instagram.com.evil.example/asha' } },
      { socials: { x: 'this_handle_is_too_long' } },
      { socials: { linkedin: 'javascript:alert(1)' } },
      { socials: { facebook: '<script>' } },
    ])
      expect((await patch(body, a)).status, JSON.stringify(body)).toBe(422);
  });

  it('a phone number or email can never be for everyone, not even through the API or the database', async () => {
    const a = await person('private');
    for (const audience of [{ email: 'members' }, { phone: 'members' }])
      expect((await patch({ audience }, a)).status, JSON.stringify(audience)).toBe(422);
    const id = await userId(a.handle);
    for (const col of ['email_audience', 'phone_audience'])
      await expect(
        q(`insert into profile_details (user_id, ${col}) values ($1, 'members')`, [id]),
        col,
      ).rejects.toThrow(/profile_details_/);
    for (const [col, value] of [
      ['website', 'javascript:alert(1)'],
      ['website', 'http://example.com'],
      ['email', 'nobody'],
      ['phone', 'call me'],
      ['instagram', 'bad/handle'],
      ['x_handle', 'x'.repeat(16)],
    ] as const)
      await expect(
        q(`insert into profile_details (user_id, ${col}) values ($1, $2)`, [id, value]),
        col,
      ).rejects.toThrow(/profile_details_/);
  });

  it('the database checks social handles with the same patterns as the app', async () => {
    const { rows } = await q(
      "select conname, pg_get_constraintdef(oid) def from pg_constraint where conname ~ '^profile_details_(instagram|linkedin|x_handle|youtube|facebook)_check$'",
    );
    const def = Object.fromEntries(rows.map((r: { conname: string; def: string }) => [r.conname, r.def]));
    for (const [site, col] of [
      ['instagram', 'instagram'],
      ['linkedin', 'linkedin'],
      ['x', 'x_handle'],
      ['youtube', 'youtube'],
      ['facebook', 'facebook'],
    ] as const)
      expect(def[`profile_details_${col}_check`], site).toContain(SOCIAL_PATTERN[site]);
  });

  it('strangers see public ones; friends also see email and phone; links never carry an audience', async () => {
    const o = await person('contact');
    await patch(
      {
        website: 'example.com',
        email: 'o@example.com',
        phone: '+91 98765 43210',
        socials: { instagram: 'owner.page' },
        audience: { website: 'members', socials: 'members', email: 'posse', phone: 'only_me' },
      },
      o,
    );
    const id = await userId(o.handle);
    const stranger = await person('passerby');
    expect(keys(await detailsForViewer(await userId(stranger.handle), id))).toEqual(['website', 'instagram']);
    const f = await person('pal');
    await friends(o, f);
    const seen = await detailsForViewer(await userId(f.handle), id);
    expect(keys(seen)).toEqual(['website', 'email', 'instagram']);
    expect(seen.every((l) => l.audience === undefined)).toBe(true);
    expect(await detailsForViewer(null, id)).toEqual([]);
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
