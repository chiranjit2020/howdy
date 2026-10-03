import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { RATE } from '@/modules/profiles/service';
import { SIGNAL_TTL_MS } from '@/shared/validation/profile';
import { call, freshAuthState, me, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { clearSignal, myRanch, patchRanch, setSignal, sql, viewRanch } from '../helpers/ranch';
import { PATCH as patchRanchRoute } from '@/app/api/me/porch/route';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const u = (cp: number) => String.fromCodePoint(cp);

describe('only the signed-in owner can change a Ranch', () => {
  it('signed-out requests are refused with 401 and change nothing', async () => {
    expect((await patchRanch({ displayName: 'Nope' })).status).toBe(401);
    expect((await setSignal('nope')).status).toBe(401);
    expect((await clearSignal()).status).toBe(401);
    expect((await myRanch()).status).toBe(401);
  });

  it('cross-site requests are refused before doing anything (CSRF)', async () => {
    const a = await signedInUser(kit);
    const evil = { cookie: a.cookie, origin: 'https://evil.example' };
    expect((await patchRanch({ displayName: 'Hijacked' }, evil)).status).toBe(403);
    expect((await setSignal('hijacked', evil)).status).toBe(403);
    expect((await clearSignal(evil)).status).toBe(403);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ displayName: a.handle, signal: null });
  });

  it('User A cannot change User B: there is no way to even name B, and smuggled ids are ignored', async () => {
    const a = await signedInUser(kit, uniqueUser('alice'));
    const b = await signedInUser(kit, uniqueUser('bob'));
    const bId = (await sql('select id from users where handle = $1', [b.handle])).rows[0].id as string;

    const attack = await patchRanch(
      { displayName: 'Alice was here', userId: bId, user_id: bId, handle: b.handle, id: bId, ownerId: bId },
      { cookie: a.cookie },
    );
    expect(attack.status).toBe(200);
    expect(attack.data.ranch).toMatchObject({ handle: a.handle, displayName: 'Alice was here' });
    // Bob is untouched
    expect((await myRanch(b.cookie)).data.ranch).toMatchObject({ handle: b.handle, displayName: b.handle });
    // ...and so are the handles
    expect((await sql('select handle from users order by handle')).rows.map((r) => r.handle)).toEqual(
      [a.handle, b.handle].sort(),
    );
  });

  it('A setting or clearing a Signal only ever touches A’s own Signal', async () => {
    const a = await signedInUser(kit, uniqueUser('alice'));
    const b = await signedInUser(kit, uniqueUser('bob'));
    await setSignal('Bob’s vibe', { cookie: b.cookie });
    await setSignal('Alice’s vibe', { cookie: a.cookie });
    await clearSignal({ cookie: a.cookie });
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ signal: null });
    expect((await myRanch(b.cookie)).data.ranch).toMatchObject({ signal: { text: 'Bob’s vibe' } });
  });

  it('mass assignment: privileged columns cannot be set through the Ranch endpoints', async () => {
    const a = await signedInUser(kit);
    const r = await patchRanch(
      {
        displayName: 'Ok',
        status: 'suspended',
        emailVerifiedAt: null,
        email: 'evil@example.com',
        signal: 'planted',
        signalExpiresAt: '2999-01-01',
        createdAt: '2000-01-01',
        role: 'admin',
      },
      { cookie: a.cookie },
    );
    expect(r.status).toBe(200);
    const row = (
      await sql(
        "select u.status, u.email, p.signal, p.created_at > now() - interval '1 hour' as fresh from users u join profiles p on p.user_id = u.id where u.handle = $1",
        [a.handle],
      )
    ).rows[0];
    expect(row).toMatchObject({ status: 'active', email: a.email, signal: null, fresh: true });
    expect((await me(a.cookie)).status).toBe(200); // still signed in, not suspended
  });
});

describe('Tend the Ranch: validation is enforced on the server', () => {
  it.each([
    ['empty display name', { displayName: '   ' }, 'displayName'],
    ['51-character display name', { displayName: 'x'.repeat(51) }, 'displayName'],
    ['a link in the name', { displayName: 'Click http://spam.example' }, 'displayName'],
    ['a bare domain in the name', { displayName: 'win-prizes.com' }, 'displayName'],
    ['a bidi override in the name (spoofing)', { displayName: `Admin${u(0x202e)}nimda` }, 'displayName'],
    ['a zero-width space in the name', { displayName: `Ad${u(0x200b)}min` }, 'displayName'],
    ['a control character in the name', { displayName: 'bad\u0007' }, 'displayName'],
    ['an unknown portrait tint', { portraitTint: 'neon' }, 'portraitTint'],
    ['an unknown visibility', { ranchVisibility: 'public' }, 'ranchVisibility'],
    ['a null visibility', { signalVisibility: null }, 'signalVisibility'],
  ])('%s → 422 on the right field, nothing changes', async (_n, body, field) => {
    const a = await signedInUser(kit);
    const r = await patchRanch(body, { cookie: a.cookie });
    expect(r.status).toBe(422);
    expect(Object.keys(r.data.error?.fields ?? {})).toContain(field);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({
      displayName: a.handle,
      portraitTint: 'peach',
      ranchVisibility: 'members',
    });
  });

  it('an empty change is refused; malformed bodies are 400', async () => {
    const a = await signedInUser(kit);
    expect((await patchRanch({}, { cookie: a.cookie })).status).toBe(422);
    expect(
      (
        await call(
          patchRanchRoute,
          'PATCH',
          '/api/me/porch',
          {},
          { cookie: a.cookie, contentType: 'text/plain' },
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(patchRanchRoute, 'PATCH', '/api/me/porch', {}, { cookie: a.cookie, rawBody: '[1]' }))
        .status,
    ).toBe(400);
  });

  it('names are normalised before storage; real names in other scripts survive intact', async () => {
    const a = await signedInUser(kit);
    expect(
      (await patchRanch({ displayName: '  Priya    Sharma  ' }, { cookie: a.cookie })).data.ranch,
    ).toMatchObject({ displayName: 'Priya Sharma' });
    expect((await patchRanch({ displayName: 'সুমন সরকার' }, { cookie: a.cookie })).data.ranch).toMatchObject({
      displayName: 'সুমন সরকার',
    });
    expect(
      (await patchRanch({ displayName: `Cafe${u(0x301)}` }, { cookie: a.cookie })).data.ranch,
    ).toMatchObject({ displayName: 'Café' });
    expect((await patchRanch({ displayName: `Zainab ${u(0x1f984)}` }, { cookie: a.cookie })).status).toBe(
      200,
    );
  });

  it('markup in a name is stored as plain data, never interpreted or rewritten', async () => {
    const a = await signedInUser(kit);
    const payload = '<img src=x onerror=alert(1)>';
    await patchRanch({ displayName: payload }, { cookie: a.cookie });
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ displayName: payload });
    // JSON API responses are not HTML
    const view = await viewRanch(a.handle, { cookie: a.cookie });
    expect(view.res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('a partial update changes only the fields sent', async () => {
    const a = await signedInUser(kit);
    await patchRanch(
      { displayName: 'First', portraitTint: 'mint', ranchVisibility: 'everyone' },
      { cookie: a.cookie },
    );
    await patchRanch({ portraitTint: 'sky' }, { cookie: a.cookie });
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({
      displayName: 'First',
      portraitTint: 'sky',
      ranchVisibility: 'everyone',
      signalVisibility: 'members',
    });
  });
});

describe('the Signal', () => {
  it('lasts 12 hours, can be replaced, and can be cleared', async () => {
    const a = await signedInUser(kit);
    const before = Date.now();
    const set = await setSignal('  Writing   code. Send chai.  ', { cookie: a.cookie });
    expect(set.status).toBe(200);
    const s = (set.data.ranch as { signal: { text: string; expiresAt: string } }).signal;
    expect(s.text).toBe('Writing code. Send chai.');
    expect(Math.abs(new Date(s.expiresAt).getTime() - (before + SIGNAL_TTL_MS))).toBeLessThan(10_000);

    expect((await setSignal('Second thought', { cookie: a.cookie })).data.ranch).toMatchObject({
      signal: { text: 'Second thought' },
    });
    expect((await clearSignal({ cookie: a.cookie })).data.ranch).toMatchObject({ signal: null });
    expect((await sql('select signal, signal_set_at, signal_expires_at from profiles')).rows[0]).toEqual({
      signal: null,
      signal_set_at: null,
      signal_expires_at: null,
    });
  });

  it.each([
    ['too long (81)', 's'.repeat(81)],
    ['empty', '   '],
    ['a link', 'see https://spam.example now'],
    ['a bare domain', 'buy at cheap-pills.com'],
    ['a bidi override', `look${u(0x202e)}here`],
    ['not a string', 12345],
  ])('rejects %s', async (_n, text) => {
    const a = await signedInUser(kit);
    const r = await setSignal(text, { cookie: a.cookie });
    expect(r.status).toBe(422);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ signal: null });
  });
});

describe('edits are rate limited (and fail closed)', () => {
  it('Ranch edits: 20 per hour per user', async () => {
    const a = await signedInUser(kit);
    for (let i = 0; i < RATE.edit.limit; i++)
      expect((await patchRanch({ portraitTint: i % 2 ? 'mint' : 'sky' }, { cookie: a.cookie })).status).toBe(
        200,
      );
    const blocked = await patchRanch({ portraitTint: 'gold' }, { cookie: a.cookie });
    expect(blocked.status).toBe(429);
    expect(blocked.res.headers.get('retry-after')).toMatch(/^\d+$/);
  }, 40_000);

  it('Signal changes: 30 per hour per user', async () => {
    const a = await signedInUser(kit);
    for (let i = 0; i < RATE.signal.limit; i++)
      expect((await setSignal(`vibe ${i}`, { cookie: a.cookie })).status).toBe(200);
    expect((await setSignal('one too many', { cookie: a.cookie })).status).toBe(429);
  }, 40_000);

  it('limits are per user: one person’s budget does not affect another’s', async () => {
    const a = await signedInUser(kit, uniqueUser('alice'));
    const b = await signedInUser(kit, uniqueUser('bob'));
    for (let i = 0; i < RATE.edit.limit; i++)
      await patchRanch({ portraitTint: 'mint' }, { cookie: a.cookie });
    expect((await patchRanch({ portraitTint: 'gold' }, { cookie: a.cookie })).status).toBe(429);
    expect((await patchRanch({ portraitTint: 'gold' }, { cookie: b.cookie })).status).toBe(200);
  }, 40_000);

  it('if the limiter is down the edit is refused, not applied', async () => {
    const a = await signedInUser(kit);
    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    const r = await patchRanch({ displayName: 'Should not apply' }, { cookie: a.cookie });
    expect(r.status).toBe(500);
    setRateLimiter(undefined);
    const { MemoryRateLimiter } = await import('@/platform/rate-limit');
    setRateLimiter(new MemoryRateLimiter());
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ displayName: a.handle });
  });
});

describe('the bio', () => {
  it('is saved, shown on the Porch to whoever may open it, and cleared by an empty one', async () => {
    const a = await signedInUser(kit, uniqueUser('alice'));
    const b = await signedInUser(kit, uniqueUser('bob'));
    const r = await patchRanch({ bio: '  Chai lover.   Weekend   cyclist 🚲 ' }, { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect((r.data as { ranch: { bio: string } }).ranch.bio).toBe('Chai lover. Weekend cyclist 🚲');
    expect((await viewRanch(a.handle, { cookie: b.cookie })).data.ranch).toMatchObject({
      bio: 'Chai lover. Weekend cyclist 🚲',
    });
    // Private Porch: a stranger gets the same 404 as ever, so the bio goes nowhere it should not.
    await patchRanch({ ranchVisibility: 'posse' }, { cookie: a.cookie });
    expect((await viewRanch(a.handle, { cookie: b.cookie })).status).toBe(404);

    expect((await patchRanch({ bio: '' }, { cookie: a.cookie })).status).toBe(200);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ bio: null });
  });

  it('refuses links, disguising characters and more than 150 characters', async () => {
    const a = await signedInUser(kit);
    for (const bio of ['find me at example.com', `hi${u(0x202e)}there`, 'x'.repeat(151)]) {
      const r = await patchRanch({ bio }, { cookie: a.cookie });
      expect(r.status, JSON.stringify(bio)).toBe(422);
      expect(r.data.error?.fields?.bio).toBeTruthy();
    }
    expect((await patchRanch({ bio: 'x'.repeat(150) }, { cookie: a.cookie })).status).toBe(200);
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ bio: 'x'.repeat(150) });
  });
});
