import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { MemoryRateLimiter } from '@/platform/rate-limit';
import { RATE } from '@/modules/profiles/service';
import { freshAuthState, signedInUser, signUpUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { myRanch, patchRanch, setSignal, sql, viewRanch } from '../helpers/ranch';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

async function twoUsers() {
  const a = await signedInUser(kit, uniqueUser('alice'));
  const b = await signedInUser(kit, uniqueUser('bob'));
  return { a, b };
}

describe('every account has a Ranch, created with the account', () => {
  it('sign-up creates the profile in the same transaction, private by default', async () => {
    const u = uniqueUser('newbie');
    await signUpUser(kit, u);
    const row = (
      await sql('select p.* from profiles p join users x on x.id = p.user_id where x.email = $1', [u.email])
    ).rows[0];
    expect(row.display_name).toBe(u.handle);
    expect(row.ranch_visibility).toBe('members');
    expect(row.signal_visibility).toBe('members');
    expect(row.portrait_tint).toBe('peach');
    expect(row.signal).toBeNull();
  });

  it('there is never a user without a profile (and the reverse is impossible)', async () => {
    await twoUsers();
    expect(
      (
        await sql(
          'select count(*)::int n from users u left join profiles p on p.user_id = u.id where p.user_id is null',
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await sql(
          'select count(*)::int n from profiles p left join users u on u.id = p.user_id where u.id is null',
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('a failed sign-up leaves neither a user nor a profile', async () => {
    const first = await signedInUser(kit);
    await signUpUser(kit, { ...uniqueUser(), handle: first.handle }); // 409: handle taken
    expect((await sql('select count(*)::int n from users')).rows[0].n).toBe(1);
    expect((await sql('select count(*)::int n from profiles')).rows[0].n).toBe(1);
  });
});

describe('who can open a Ranch (privacy defaults and settings)', () => {
  it('by default: any signed-in member can open it; a signed-out visitor cannot', async () => {
    const { a, b } = await twoUsers();
    const asMember = await viewRanch(b.handle, { cookie: a.cookie });
    expect(asMember.status).toBe(200);
    expect(asMember.data.ranch).toMatchObject({ handle: b.handle, displayName: b.handle, isOwner: false });
    expect((await viewRanch(b.handle)).status).toBe(404);
  });

  it('“everyone” opens it to signed-out visitors too', async () => {
    const { b } = await twoUsers();
    await patchRanch({ ranchVisibility: 'everyone' }, { cookie: b.cookie });
    expect((await viewRanch(b.handle)).status).toBe(200);
  });

  it('“posse” hides it from strangers (no relationships exist yet), but never from its owner', async () => {
    const { a, b } = await twoUsers();
    await patchRanch({ ranchVisibility: 'posse', signalVisibility: 'posse' }, { cookie: b.cookie });
    expect((await viewRanch(b.handle, { cookie: a.cookie })).status).toBe(404);
    expect((await viewRanch(b.handle)).status).toBe(404);
    const own = await viewRanch(b.handle, { cookie: b.cookie });
    expect(own.status).toBe(200);
    expect((own.data.ranch as { isOwner: boolean }).isOwner).toBe(true);
  });

  it('handles are matched case-insensitively', async () => {
    const { a, b } = await twoUsers();
    expect((await viewRanch(b.handle.toUpperCase(), { cookie: a.cookie })).status).toBe(200);
  });
});

describe('a hidden Ranch is indistinguishable from one that does not exist', () => {
  it('missing, hidden-from-anonymous and posse-only give the same status and body', async () => {
    const { a, b } = await twoUsers();
    const missing = await viewRanch('nobody_home', { cookie: a.cookie });
    const anonymousVsMembersOnly = await viewRanch(b.handle);
    await patchRanch({ ranchVisibility: 'posse' }, { cookie: b.cookie });
    const strangerVsPosseOnly = await viewRanch(b.handle, { cookie: a.cookie });
    for (const r of [anonymousVsMembersOnly, strangerVsPosseOnly]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
  });

  it('a suspended owner’s Ranch disappears for everyone', async () => {
    const { a, b } = await twoUsers();
    await sql("update users set status = 'suspended' where handle = $1", [b.handle]);
    expect((await viewRanch(b.handle, { cookie: a.cookie })).status).toBe(404);
  });

  it.each(['', 'ab', '../../etc/passwd', "x'; drop table users;--", 'a'.repeat(40), '%00', 'é'])(
    'a malformed handle (%j) is a plain 404, never a database error',
    async (h) => {
      const { a } = await twoUsers();
      const r = await viewRanch(h || 'x', { cookie: a.cookie });
      expect(r.status).toBe(404);
      expect(r.text).not.toMatch(/syntax|relation|postgres|stack/i);
    },
  );
});

describe('what a viewer receives', () => {
  it('only the public projection: never the email, ids, account status or privacy settings', async () => {
    const { a, b } = await twoUsers();
    const r = await viewRanch(b.handle, { cookie: a.cookie });
    expect(Object.keys(r.data.ranch!).sort()).toEqual([
      'bio', // the short line the owner chose to show on their Porch
      'displayName',
      'handle',
      'isOwner',
      'portraitTint',
      'signal',
      'trusted', // the public Trusted tick (ADR-020); never the checklist or any count behind it
      'verified', // the public Verified badge (the Howdy team account); never the role itself
    ]);
    const userId = (await sql('select id from users where handle = $1', [b.handle])).rows[0].id as string;
    for (const secret of [
      b.email,
      userId,
      'suspended',
      'ranchVisibility',
      'signalVisibility',
      'ranch_visibility',
    ]) {
      expect(r.text, secret).not.toContain(secret);
    }
  });

  it('the owner’s own view (GET /api/me/porch) adds their privacy settings, and only theirs', async () => {
    const { a, b } = await twoUsers();
    await patchRanch({ displayName: 'Bob the Builder', ranchVisibility: 'everyone' }, { cookie: b.cookie });
    const own = await myRanch(b.cookie);
    expect(own.data.ranch).toMatchObject({
      handle: b.handle,
      displayName: 'Bob the Builder',
      ranchVisibility: 'everyone',
      signalVisibility: 'members',
    });
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ handle: a.handle, displayName: a.handle });
    expect((await myRanch()).status).toBe(401);
  });
});

describe('the Signal has its own visibility, never broader than the Ranch', () => {
  it('members see it by default; “posse” hides only the Signal, not the Ranch', async () => {
    const { a, b } = await twoUsers();
    await setSignal('In the zone', { cookie: b.cookie });
    expect((await viewRanch(b.handle, { cookie: a.cookie })).data.ranch).toMatchObject({
      signal: { text: 'In the zone' },
    });
    await patchRanch({ signalVisibility: 'posse' }, { cookie: b.cookie });
    const r = await viewRanch(b.handle, { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect(r.data.ranch).toMatchObject({ displayName: b.handle, signal: null });
    expect(r.text).not.toContain('In the zone');
    expect((await viewRanch(b.handle, { cookie: b.cookie })).data.ranch).toMatchObject({
      signal: { text: 'In the zone' },
    }); // owner still sees it
  });

  it('a Signal set to “everyone” on a members-only Ranch leaks nothing to signed-out visitors', async () => {
    const { b } = await twoUsers();
    await setSignal('Only for members', { cookie: b.cookie });
    await patchRanch({ ranchVisibility: 'members', signalVisibility: 'everyone' }, { cookie: b.cookie });
    const anon = await viewRanch(b.handle);
    expect(anon.status).toBe(404);
    expect(anon.text).not.toContain('Only for members');
  });

  it('a public Ranch with a members-only Signal shows signed-out visitors the Ranch but not the Signal', async () => {
    const { a, b } = await twoUsers();
    await setSignal('Members only vibe', { cookie: b.cookie });
    await patchRanch({ ranchVisibility: 'everyone', signalVisibility: 'members' }, { cookie: b.cookie });
    const anon = await viewRanch(b.handle);
    expect(anon.status).toBe(200);
    expect(anon.data.ranch).toMatchObject({ signal: null });
    expect((await viewRanch(b.handle, { cookie: a.cookie })).data.ranch).toMatchObject({
      signal: { text: 'Members only vibe' },
    });
  });

  it('an expired Signal is invisible immediately — even to its owner — without waiting for the purge job', async () => {
    const { a, b } = await twoUsers();
    await setSignal('Gone soon', { cookie: b.cookie });
    await sql(
      "update profiles set signal_expires_at = now() - interval '1 second' where user_id = (select id from users where handle = $1)",
      [b.handle],
    );
    expect((await viewRanch(b.handle, { cookie: a.cookie })).data.ranch).toMatchObject({ signal: null });
    expect((await myRanch(b.cookie)).data.ranch).toMatchObject({ signal: null });
  });
});

describe('scraping defence: opening Ranches is rate limited (and fails closed)', () => {
  it('signed-out visitors: the limit is per address', async () => {
    for (let i = 0; i < RATE.viewAnonymous.limit; i++)
      expect((await viewRanch('x_nobody', { ip: '198.51.100.20' })).status).toBe(404);
    expect((await viewRanch('x_nobody', { ip: '198.51.100.20' })).status).toBe(429);
    expect((await viewRanch('x_nobody', { ip: '198.51.100.21' })).status).toBe(404);
  });

  it('signed-in viewers have a bigger budget, keyed to the account rather than the address', async () => {
    const { a } = await twoUsers();
    setRateLimiter(new MemoryRateLimiter());
    for (let i = 0; i < RATE.viewUser.limit; i++)
      await viewRanch('x_nobody', { cookie: a.cookie, ip: `10.9.0.${i % 200}` });
    expect((await viewRanch('x_nobody', { cookie: a.cookie, ip: '10.9.9.9' })).status).toBe(429);
  }, 40_000);

  it('if the limiter backend is down, opening a Ranch is refused rather than unlimited', async () => {
    const { a, b } = await twoUsers();
    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    const r = await viewRanch(b.handle, { cookie: a.cookie });
    expect(r.status).toBe(500);
    expect(r.text).not.toContain('redis');
  });
});

describe('data integrity is enforced by the database too', () => {
  it.each([
    ['unknown visibility', "ranch_visibility = 'public'", /profiles_ranch_visibility_check/],
    ['unknown signal visibility', "signal_visibility = 'friends'", /profiles_signal_visibility_check/],
    ['unknown tint', "portrait_tint = 'neon'", /profiles_portrait_tint_check/],
    ['empty display name', "display_name = ''", /profiles_display_name_len/],
    ['51-char display name', `display_name = '${'x'.repeat(51)}'`, /profiles_display_name_len/],
    ['control character in name', "display_name = E'bad\\tname'", /profiles_display_name_clean/],
    ['81-char signal', `signal = '${'s'.repeat(81)}', signal_expires_at = now()`, /profiles_signal_len/],
    ['signal without expiry', "signal = 'hello'", /profiles_signal_pair/],
    ['expiry without signal', 'signal_expires_at = now()', /profiles_signal_pair/],
  ])('rejects %s', async (_n, set, constraint) => {
    await signedInUser(kit);
    await expect(sql(`update profiles set ${set}`)).rejects.toThrow(constraint);
  });

  it('deleting a user removes their profile (cascade), and nothing else is orphaned', async () => {
    const { b } = await twoUsers();
    await sql('delete from users where handle = $1', [b.handle]);
    expect((await sql('select count(*)::int n from profiles')).rows[0].n).toBe(1);
  });
});
