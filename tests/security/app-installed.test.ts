import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as installedRoute } from '@/app/api/me/app-installed/route';
import { hasInstalledApp } from '@/modules/auth';
import { getPool } from '@/platform/db';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { q, userId } from '../helpers/social';

/** Home's "Get the Howdy app" bar goes away for good once the installed app has been opened (2026-11-11). */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const installedAt = async (handle: string) =>
  (await q('select app_installed_at from users where handle = $1', [handle])).rows[0]
    .app_installed_at as Date | null;

describe('remembering the installed app', () => {
  it('signed in: marked once, and a second call keeps the first time', async () => {
    const me = await signedInUser(kit, uniqueUser('me'));
    const id = await userId(me.handle);
    expect(await hasInstalledApp(id)).toBe(false);

    expect(
      (await call(installedRoute, 'POST', '/api/me/app-installed', undefined, { cookie: me.cookie })).status,
    ).toBe(200);
    const first = await installedAt(me.handle);
    expect(first).not.toBeNull();
    expect(await hasInstalledApp(id)).toBe(true);

    await call(installedRoute, 'POST', '/api/me/app-installed', undefined, { cookie: me.cookie });
    expect(await installedAt(me.handle)).toEqual(first);
  });

  it('signed out: refused, and nobody is marked', async () => {
    const other = await signedInUser(kit, uniqueUser('other'));
    expect((await call(installedRoute, 'POST', '/api/me/app-installed')).status).toBe(401);
    expect(await installedAt(other.handle)).toBeNull();
  });
});
