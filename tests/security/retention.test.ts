import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken, newToken } from '@/modules/auth/crypto';
import { purgeExpiredAuthData, purgeOldAuditLog } from '@/modules/auth';
import { clearExpiredSignals } from '@/modules/profiles';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { setSignal, sql, viewRanch } from '../helpers/ranch';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

describe('Signal retention (master prompt §54: ephemeral data is not kept forever)', () => {
  it('physically clears expired Signals, leaves live ones alone, and is idempotent', async () => {
    const a = await signedInUser(kit, uniqueUser('alice'));
    const b = await signedInUser(kit, uniqueUser('bob'));
    await setSignal('expired', { cookie: a.cookie });
    await setSignal('still alive', { cookie: b.cookie });
    await sql(
      "update profiles set signal_expires_at = now() - interval '1 minute' where user_id = (select id from users where handle = $1)",
      [a.handle],
    );

    expect(await clearExpiredSignals()).toBe(1);
    const rows = (
      await sql(
        'select u.handle, p.signal, p.signal_set_at, p.signal_expires_at from profiles p join users u on u.id = p.user_id order by u.handle',
      )
    ).rows;
    expect(rows.find((r) => r.handle === a.handle)).toMatchObject({
      signal: null,
      signal_set_at: null,
      signal_expires_at: null,
    });
    expect(rows.find((r) => r.handle === b.handle)).toMatchObject({ signal: 'still alive' });
    expect(await clearExpiredSignals()).toBe(0);
    expect((await viewRanch(b.handle, { cookie: a.cookie })).data.ranch).toMatchObject({
      signal: { text: 'still alive' },
    });
  });

  it('respects the supplied clock (a Signal is kept until its exact expiry)', async () => {
    const a = await signedInUser(kit);
    await setSignal('hello', { cookie: a.cookie });
    expect(await clearExpiredSignals(new Date(Date.now() + 11 * 3_600_000))).toBe(0);
    expect(await clearExpiredSignals(new Date(Date.now() + 13 * 3_600_000))).toBe(1);
  });
});

describe('authentication data retention', () => {
  const DAY = "interval '1 day'";
  async function seed() {
    const u = await signedInUser(kit); // has one live session
    const userId = (await sql('select id from users where handle = $1', [u.handle])).rows[0].id as string;
    const session = (revoked: string | null, idleOffset: string, absoluteOffset: string) =>
      sql(
        `insert into sessions (user_id, token_hash, idle_expires_at, absolute_expires_at, revoked_at)
         values ($1, $2, now() + ${idleOffset}, now() + ${absoluteOffset}, ${revoked ? `now() - ${revoked}` : 'null'})`,
        [userId, hashToken(newToken().token)],
      );
    const token = (purpose: string, expiresOffset: string, used: string | null) =>
      sql(
        `insert into email_tokens (user_id, purpose, token_hash, expires_at, used_at)
         values ($1, $2, $3, now() + ${expiresOffset}, ${used ? `now() - ${used}` : 'null'})`,
        [userId, purpose, hashToken(newToken().token)],
      );
    return { userId, session, token };
  }
  const count = async (table: string) =>
    (await sql(`select count(*)::int n from ${table}`)).rows[0].n as number;

  it('removes sessions revoked or expired more than 30 days ago, and never a live or recently-dead one', async () => {
    const { session } = await seed();
    const liveBefore = await count('sessions'); // 1 live session from sign-in
    await session(`${DAY} * 31`, `${DAY} * 10`, `${DAY} * 10`); // revoked 31 days ago -> purge
    await session(`${DAY} * 1`, `${DAY} * 10`, `${DAY} * 10`); // revoked yesterday -> keep
    await session(null, `-${DAY} * 31`, `${DAY} * 10`); // idle-expired 31 days ago -> purge
    await session(null, `${DAY} * 5`, `-${DAY} * 31`); // absolute-expired 31 days ago -> purge
    await session(null, `-${DAY} * 2`, `${DAY} * 10`); // expired 2 days ago -> keep (grace)
    await session(null, `${DAY} * 5`, `${DAY} * 30`); // live -> keep

    const result = await purgeExpiredAuthData();
    expect(result.sessions).toBe(3);
    expect(await count('sessions')).toBe(liveBefore + 3); // sign-in session + 3 kept
    expect(
      (
        await sql(
          'select count(*)::int n from sessions where revoked_at is null and idle_expires_at > now() and absolute_expires_at > now()',
        )
      ).rows[0].n,
    ).toBe(liveBefore + 1);
  });

  it('removes email tokens used or expired more than a week ago, and never a live one', async () => {
    const { token } = await seed();
    await sql('delete from email_tokens'); // clean baseline
    await token('verify_email', `${DAY} * 5`, `${DAY} * 8`); // used 8 days ago -> purge
    await token('verify_email', `${DAY} * 5`, `${DAY} * 1`); // used yesterday -> keep
    await token('reset_password', `-${DAY} * 8`, null); // expired 8 days ago -> purge
    await token('reset_password', `-${DAY} * 1`, null); // expired yesterday -> keep
    await token('reset_password', `${DAY} * 1`, null); // live and unused -> keep

    const result = await purgeExpiredAuthData();
    expect(result.emailTokens).toBe(2);
    expect(await count('email_tokens')).toBe(3);
    expect(
      (await sql('select count(*)::int n from email_tokens where used_at is null and expires_at > now()'))
        .rows[0].n,
    ).toBe(1);
  });

  it('is idempotent, and does not touch users, profiles or audit records', async () => {
    const { session } = await seed();
    await session(`${DAY} * 40`, `${DAY} * 10`, `${DAY} * 10`);
    const users = await count('users');
    const profiles = await count('profiles');
    const audit = await count('audit_log');
    await purgeExpiredAuthData();
    const second = await purgeExpiredAuthData();
    expect(second).toEqual({ emailTokens: 0, sessions: 0, challenges: 0, unfinishedApps: 0 });
    expect(await count('users')).toBe(users);
    expect(await count('profiles')).toBe(profiles);
    expect(await count('audit_log')).toBe(audit);
  });
});

describe('security records (audit log) retention: 12 months', () => {
  it('deletes entries older than 365 days, keeps younger ones, and is idempotent', async () => {
    await sql(`insert into audit_log (event, created_at) values
      ('old', now() - interval '366 days'),
      ('edge', now() - interval '364 days'),
      ('new', now())`);
    expect(await purgeOldAuditLog()).toEqual({ auditEntries: 1 });
    const left = (await sql('select event from audit_log order by event')).rows.map((r) => r.event);
    expect(left).toEqual(['edge', 'new']);
    expect(await purgeOldAuditLog()).toEqual({ auditEntries: 0 });
  });
});
