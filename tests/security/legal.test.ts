import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as pendingRoute, POST as acceptRoute } from '@/app/api/me/legal/route';
import { GET as purgeRoute } from '@/app/api/jobs/purge/route';
import { authHandlers } from '@/modules/auth';
import { resetEnvCache } from '@/platform/config/env';
import { getPool } from '@/platform/db';
import { LEGAL_DOCS, requiredVersion } from '@/shared/legal';
import { call, freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { q, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const accepted = async (handle: string) =>
  (
    await q(
      `select document, version from legal_acceptances a join users u on u.id = a.user_id
        where u.handle = $1 order by document, version`,
      [handle],
    )
  ).rows;
const signup = (body: unknown) => call(authHandlers.signup, 'POST', '/api/auth/signup', body);
const pending = (cookie?: string) => call(pendingRoute, 'GET', '/api/me/legal', undefined, { cookie });
const accept = (cookie?: string, body: unknown = {}) =>
  call(acceptRoute, 'POST', '/api/me/legal', body, { cookie });
const current = () => [
  { document: 'privacy', version: requiredVersion('privacy') },
  { document: 'terms', version: requiredVersion('terms') },
];

describe('agreeing at Stake a Claim', () => {
  it.each([
    ['missing', undefined],
    ['false', false],
    ['the string "true"', 'true'],
    ['1', 1],
  ])('refuses sign-up when the box is %s (422) and creates nothing', async (_n, acceptTerms) => {
    const u = { ...uniqueUser('noagree'), acceptTerms };
    const r = await signup(u);
    expect(r.status).toBe(422);
    expect(r.data.error?.fields?.acceptTerms).toMatch(/18 or older/);
    expect((await q('select 1 from users where handle = $1', [u.handle])).rowCount).toBe(0);
  });

  it('records the current Terms and Privacy versions with the new account, in the same transaction', async () => {
    const a = await signedInUser(kit, uniqueUser('agreed'));
    expect(await accepted(a.handle)).toEqual(current());
    const [row] = (
      await q(
        `select a.accepted_at, u.created_at from legal_acceptances a join users u on u.id = a.user_id
          where u.handle = $1 limit 1`,
        [a.handle],
      )
    ).rows;
    expect(Math.abs(row.accepted_at.getTime() - row.created_at.getTime())).toBeLessThan(5_000);
    expect((await pending(a.cookie)).data).toEqual({ pending: [] });
  });

  it('a client cannot choose which version it agreed to (the server always records the current one)', async () => {
    const u = uniqueUser('pickver');
    await signup({ ...u, termsVersion: '0.0.1', version: '9.9.9' });
    expect(await accepted(u.handle)).toEqual(current());
  });
});

describe('agreeing later (/agree)', () => {
  it('an account from before acceptance was tracked must agree to both, once', async () => {
    const a = await signedInUser(kit, uniqueUser('old'));
    await q('delete from legal_acceptances where user_id = $1', [await userId(a.handle)]);
    expect((await pending(a.cookie)).data).toEqual({ pending: ['terms', 'privacy'] });

    expect((await accept(a.cookie)).status).toBe(200);
    expect(await accepted(a.handle)).toEqual(current());
    expect((await pending(a.cookie)).data).toEqual({ pending: [] });

    // idempotent: agreeing again adds nothing and audits nothing
    await accept(a.cookie);
    expect(await accepted(a.handle)).toEqual(current());
    const audits = await q("select meta from audit_log where event = 'legal_accepted'");
    expect(audits.rows).toEqual([
      { meta: { terms: requiredVersion('terms'), privacy: requiredVersion('privacy') } },
    ]);
  });

  it('only a document whose required version moved is asked again; the history is kept', async () => {
    const a = await signedInUser(kit, uniqueUser('moved'));
    // Simulate: they agreed to an older Terms only (the required version has since moved on).
    await q("update legal_acceptances set version = '0.9.0' where document = 'terms' and user_id = $1", [
      await userId(a.handle),
    ]);
    expect((await pending(a.cookie)).data).toEqual({ pending: ['terms'] });
    await accept(a.cookie);
    expect(await accepted(a.handle)).toEqual([
      { document: 'privacy', version: requiredVersion('privacy') },
      { document: 'terms', version: '0.9.0' },
      { document: 'terms', version: requiredVersion('terms') },
    ]);
  });

  it('a wording-only change (version moves, acceptVersion does not) asks nobody again', async () => {
    const a = await signedInUser(kit, uniqueUser('typo'));
    const terms = LEGAL_DOCS.terms;
    const before = terms.version;
    terms.version = '1.0.1';
    try {
      expect((await pending(a.cookie)).data).toEqual({ pending: [] });
    } finally {
      terms.version = before;
    }
  });

  it('signed out is 401 and records nothing; the body cannot pick a version', async () => {
    expect((await pending()).status).toBe(401);
    expect((await accept()).status).toBe(401);
    const a = await signedInUser(kit, uniqueUser('body'));
    await q('delete from legal_acceptances where user_id = $1', [await userId(a.handle)]);
    await accept(a.cookie, { document: 'terms', version: '0.0.1' });
    expect(await accepted(a.handle)).toEqual(current());
  });

  it('acceptance rows are deleted with the account', async () => {
    const a = await signedInUser(kit, uniqueUser('gone'));
    await q('delete from users where handle = $1', [a.handle]);
    expect((await q('select count(*)::int n from legal_acceptances')).rows[0].n).toBe(0);
  });

  it('the database refuses a document or version it does not know', async () => {
    const a = await signedInUser(kit, uniqueUser('dbcheck'));
    const id = await userId(a.handle);
    await expect(
      q("insert into legal_acceptances (user_id, document, version) values ($1, 'cookies', '1.0.0')", [id]),
    ).rejects.toThrow(/legal_acceptances_document_check/);
    await expect(
      q("insert into legal_acceptances (user_id, document, version) values ($1, 'terms', 'latest')", [id]),
    ).rejects.toThrow(/legal_acceptances_version_check/);
  });
});

describe('the daily retention run (/api/jobs/purge)', () => {
  const env = process.env as Record<string, string | undefined>;
  const run = (auth?: string) =>
    purgeRoute(
      new Request('http://localhost:3000/api/jobs/purge', { headers: auth ? { authorization: auth } : {} }),
    );
  afterEach(() => {
    delete env.CRON_SECRET;
    resetEnvCache();
  });

  it('does not exist without a secret, refuses a wrong one, and runs with the right one', async () => {
    delete env.CRON_SECRET;
    resetEnvCache();
    expect((await run('Bearer anything')).status).toBe(404);

    env.CRON_SECRET = 'c'.repeat(40);
    resetEnvCache();
    expect((await run()).status).toBe(401);
    expect((await run(`Bearer ${'d'.repeat(40)}`)).status).toBe(401);

    // An expired email link (kept 7 days after expiry) is removed by the run.
    const a = await signedInUser(kit, uniqueUser('purge'));
    const id = await userId(a.handle);
    await q(
      `insert into email_tokens (user_id, purpose, token_hash, expires_at)
       values ($1, 'verify_email', decode(md5(random()::text), 'hex'), now() - interval '30 days')`,
      [id],
    );
    const before = (await q('select count(*)::int n from email_tokens where user_id = $1', [id])).rows[0].n;
    const res = await run(`Bearer ${'c'.repeat(40)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    const after = (await q('select count(*)::int n from email_tokens where user_id = $1', [id])).rows[0].n;
    expect(after).toBe(before - 1);
  });
});
