import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as myInviteRoute, POST as resetRoute } from '@/app/api/me/invite/route';
import { authHandlers } from '@/modules/auth';
import { INVITE_WEEKLY_CAP, inviterName, purgeOldInvitations, redeemInvitation } from '@/modules/invites';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  call,
  freshAuthState,
  settledUser,
  signedInUser,
  signUpUser,
  tokenFrom,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { chimesOf } from '../helpers/chimes';
import { q } from '../helpers/social';

/** ADR-045: personal invite links — signing up through one sends the inviter a Pal request, and nothing more. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = { cookie: string; handle: string };
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const idOf = async (handle: string) =>
  (await q('select id from users where handle = $1', [handle])).rows[0].id as string;

const linkOf = async (p: P) => {
  const r = await call(myInviteRoute, 'GET', '/api/me/invite', undefined, as(p));
  expect(r.status).toBe(200);
  return (r.data as { invite: { code: string; joinedThisWeek: number } }).invite;
};
const reset = async (p: P) =>
  (
    (await call(resetRoute, 'POST', '/api/me/invite', undefined, as(p))).data as {
      invite: { code: string };
    }
  ).invite.code;

/** The Pal-request link between two people, if any: who asked, and its status. */
const linkBetween = async (a: string, b: string) => {
  const [x, y] = [await idOf(a), await idOf(b)];
  const { rows } = await q(
    `select status, requested_by from posse_links
      where (user_low = $1 and user_high = $2) or (user_low = $2 and user_high = $1)`,
    [x, y],
  );
  return rows[0] ? { status: rows[0].status as string, askedBy: rows[0].requested_by as string } : null;
};

describe('my invite link', () => {
  it('is made once and stays the same; resetting gives a new one and the old one stops working', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const first = await linkOf(rick);
    expect(first.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect((await linkOf(rick)).code).toBe(first.code);
    expect(await inviterName(first.code)).toBe(rick.handle); // display name defaults to the call sign
    const next = await reset(rick);
    expect(next).not.toBe(first.code);
    expect(await inviterName(first.code)).toBeNull();
    expect(await inviterName(next)).toBe(rick.handle);
  });

  it('shows the display name only — never the call sign', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    await q(
      `update profiles set display_name = 'Rick K' where user_id = (select id from users where handle = $1)`,
      [rick.handle],
    );
    expect(await inviterName(code)).toBe('Rick K');
  });

  it('needs a session', async () => {
    expect((await call(myInviteRoute, 'GET', '/api/me/invite', undefined, {})).status).toBe(401);
    expect((await call(resetRoute, 'POST', '/api/me/invite', undefined, {})).status).toBe(401);
  });

  it('a link of an account that is no longer active shows as no invite at all', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    await q(`update users set status = 'suspended' where handle = $1`, [rick.handle]);
    expect(await inviterName(code)).toBeNull();
    // …and nobody signing up through it is recorded as invited.
    await signUpUser(kit, { ...uniqueUser('late'), invite: code } as ReturnType<typeof uniqueUser>);
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(0);
    expect(await inviterName('nonsense')).toBeNull();
    expect(await inviterName('AAAAAAAAAA')).toBeNull();
  });
});

describe('signing up through a link', () => {
  it('sends a Pal request to the inviter once the email is confirmed — not before, and nothing more', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    const meera = { ...uniqueUser('meera'), invite: code };
    await signUpUser(kit, meera);
    expect(await linkBetween(rick.handle, meera.handle)).toBeNull(); // not confirmed yet
    await signedInUser(kit, uniqueUser('other')); // unrelated sign-ups change nothing
    // Confirmed through the mailed link.
    const token = tokenFrom(kit.mailer.lastTo(meera.email)!.text);
    expect((await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', { token })).status).toBe(
      200,
    );
    await flushBackground();
    expect(await linkBetween(rick.handle, meera.handle)).toEqual({
      status: 'requested',
      askedBy: await idOf(meera.handle),
    });
    expect((await chimesOf(as(rick))).data.chimes!.map((c) => c.type)).toContain('posse_requested');
    expect((await linkOf(rick)).joinedThisWeek).toBe(1);
  });

  it('the sign-up looks exactly the same with a working link, a dead link, or none', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    const shapes = [];
    for (const invite of [code, 'AAAAAAAAAA', 'not a code at all', undefined]) {
      const u = { ...uniqueUser('sam'), ...(invite ? { invite } : {}) };
      const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', u);
      shapes.push([r.status, r.text]);
    }
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(shapes[0]![0]).toBe(202);
    await flushBackground();
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(1);
  });

  it('a reset link, or one that is not a link at all, brings nothing', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    await reset(rick);
    await signedInUser(kit, { ...uniqueUser('late'), invite: code } as ReturnType<typeof uniqueUser>);
    await flushBackground();
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(0);
  });

  it('an address that already has an account never becomes an invitation', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    const existing = await settledUser(kit, uniqueUser('old'));
    await call(authHandlers.signup, 'POST', '/api/auth/signup', {
      ...uniqueUser('dupe'),
      email: existing.email,
      invite: code,
    });
    await flushBackground();
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(0);
    expect(await linkBetween(rick.handle, existing.handle)).toBeNull();
  });

  it(`at most ${INVITE_WEEKLY_CAP} sign-ups a week per link; older ones do not count`, async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    const rickId = await idOf(rick.handle);
    // Earlier sign-ups, straight into the database (accounts are cheap to fake, sign-ups are not).
    const { rows } = await q(
      `insert into users (email, handle) select 'cap' || g || '@example.com', 'cap' || g from generate_series(1, $1) g
       returning id`,
      [INVITE_WEEKLY_CAP],
    );
    for (const r of rows)
      await q('insert into invitations (invitee_id, inviter_id) values ($1, $2)', [r.id, rickId]);
    await signUpUser(kit, { ...uniqueUser('over'), invite: code } as ReturnType<typeof uniqueUser>);
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(INVITE_WEEKLY_CAP);
    await q(`update invitations set created_at = now() - interval '8 days'`);
    await signUpUser(kit, { ...uniqueUser('fresh'), invite: code } as ReturnType<typeof uniqueUser>);
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(INVITE_WEEKLY_CAP + 1);
  });

  it('the request goes once, and not at all to an inviter who is no longer active', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    const meera = await signedInUser(kit, { ...uniqueUser('meera'), invite: code } as ReturnType<
      typeof uniqueUser
    >);
    await flushBackground();
    expect(await redeemInvitation(await idOf(meera.handle))).toBe(false); // already sent

    const ann = await settledUser(kit, uniqueUser('ann'));
    const annCode = (await linkOf(ann)).code;
    const ravi = { ...uniqueUser('ravi'), invite: annCode };
    await signUpUser(kit, ravi as ReturnType<typeof uniqueUser>);
    await q(`update users set status = 'suspended' where handle = $1`, [ann.handle]);
    const token = tokenFrom(kit.mailer.lastTo(ravi.email)!.text);
    await call(authHandlers.verifyEmail, 'POST', '/api/auth/verify-email', { token });
    await flushBackground();
    expect(await linkBetween(ann.handle, ravi.handle)).toBeNull();
  });
});

describe('what is kept', () => {
  it('invitations are deleted 30 days after sign-up, and go with either account', async () => {
    const rick = await settledUser(kit, uniqueUser('rick'));
    const { code } = await linkOf(rick);
    await signedInUser(kit, { ...uniqueUser('anya'), invite: code } as ReturnType<typeof uniqueUser>);
    const b = await signedInUser(kit, { ...uniqueUser('bina'), invite: code } as ReturnType<
      typeof uniqueUser
    >);
    await flushBackground();
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(2);
    await q(`delete from users where handle = $1`, [b.handle]);
    expect((await q('select count(*)::int n from invitations')).rows[0].n).toBe(1);
    await q(`update invitations set created_at = now() - interval '31 days'`);
    expect((await purgeOldInvitations()).invitations).toBe(1);
    await q(`delete from users where handle = $1`, [rick.handle]);
    expect((await q('select count(*)::int n from invite_links')).rows[0].n).toBe(0);
  });
});
