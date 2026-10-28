import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { getPool } from '@/platform/db';
import { call, freshAuthState, signUpUser, uniqueUser, type TestKit } from '../helpers/auth';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const check = (handle: unknown) =>
  call(authHandlers.handleAvailable, 'POST', '/api/auth/handle-available', { handle });

describe('"is this username free?" on Create account', () => {
  it('says free for an unused username and taken for one already signed up (even before the email is confirmed)', async () => {
    const u = uniqueUser();
    expect((await check(u.handle)).data).toEqual({ available: true });
    await signUpUser(kit, u);
    expect((await check(u.handle)).data).toEqual({ available: false });
    // Same rule as sign-up: case and spaces do not make a different username.
    expect((await check(` ${u.handle.toUpperCase()} `)).data).toEqual({ available: false });
  });

  it('answers a bad or reserved username with the same field error sign-up gives, without touching the database', async () => {
    const bad = await check('no spaces');
    expect(bad.res.status).toBe(422);
    expect(bad.data.error?.fields?.handle).toBe('Use only letters, numbers and underscores.');
    expect((await check('admin')).data.error?.fields?.handle).toBe('That username is reserved.');
  });

  it('never accepts an email in place of a username (emails stay unenumerable)', async () => {
    const r = await check('someone@example.com');
    expect(r.res.status).toBe(422);
  });

  it('is rate limited per source', async () => {
    let last = 0;
    for (let i = 0; i < 125; i++) last = (await check(`free_name_${i}`)).res.status;
    expect(last).toBe(429);
  });
});
