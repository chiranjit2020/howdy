import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { capitaliseName, nameFromHandle } from '@/shared/names';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';

/**
 * Migration 0056 capitalised the names already saved. It must give exactly what the app now saves (src/shared/names.ts),
 * so a name looks the same whether it was written before or after.
 */
let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const MIGRATION = readFileSync('db/migrations/0056_capitalise_names.sql', 'utf8');
const setName = (handle: string, name: string) =>
  getPool().query(
    'update profiles set display_name = $1 where user_id = (select id from users where handle = $2)',
    [name, handle],
  );
const nameOf = async (handle: string) =>
  (
    await getPool().query<{ n: string }>(
      'select p.display_name as n from profiles p join users u on u.id = p.user_id where u.handle = $1',
      [handle],
    )
  ).rows[0]!.n;

describe('migration 0056: saved names, capitalised like new ones', () => {
  it('matches the app for usernames used as names, lowercase words, mixed case and other scripts', async () => {
    const names = ['asha k', 'McDonald DJ', 'jean-luc picard', 'अनन्या', '🌻 sunny  side', 'Already Fine'];
    const people = await Promise.all(
      [...names, 'HANDLE'].map((_, i) => signedInUser(kit, uniqueUser(`cap${i}`))),
    );
    await Promise.all(names.map((n, i) => setName(people[i]!.handle, n)));
    const asHandle = people[names.length]!;
    await setName(asHandle.handle, asHandle.handle);

    await getPool().query(MIGRATION);

    for (const [i, n] of names.entries()) expect(await nameOf(people[i]!.handle)).toBe(capitaliseName(n));
    expect(await nameOf(asHandle.handle)).toBe(nameFromHandle(asHandle.handle));
    expect(await nameOf(asHandle.handle)).not.toBe(asHandle.handle);
    // Running it again changes nothing.
    await getPool().query(MIGRATION);
    expect(await nameOf(people[0]!.handle)).toBe('Asha K');
  });

  it('an email sign-up without a typed name starts with its username made readable', async () => {
    const p = await signedInUser(kit, uniqueUser('new_one'));
    expect(await nameOf(p.handle)).toBe(nameFromHandle(p.handle));
  });
});
