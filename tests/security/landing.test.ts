import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { freshAuthState, loginAs, uniqueUser, verifiedUser, type TestKit } from '../helpers/auth';

/** 2026-11-07: an account's very first sign-in lands on its own profile; every sign-in after that, on Home. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

describe('where you land after signing in', () => {
  it('the first time: your own profile; after that: Home', async () => {
    const u = uniqueUser('lander');
    await verifiedUser(kit, u);
    const first = await loginAs(u);
    expect(first.data.next).toBe(`/profile/${u.handle}`);
    const second = await loginAs(u);
    expect(second.data.next).toBe('/home');
  });

  it('a failed sign-in does not count: the first real one still lands on the profile', async () => {
    const u = uniqueUser('lander');
    await verifiedUser(kit, u);
    const wrong = await loginAs({ email: u.email, password: `${u.password}-nope` });
    expect(wrong.data.next).toBeUndefined();
    expect((await loginAs(u)).data.next).toBe(`/profile/${u.handle}`);
  });
});
