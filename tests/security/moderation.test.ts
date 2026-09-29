import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE } from '@/modules/moderation/service';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, me, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { fenceOf, flagCard, nail } from '../helpers/fence';
import { account, actOnAccount, actOnReport, makeRole, queue } from '../helpers/moderation';
import { q, report, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = { handle: string; cookie: string };
const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const statusOf = async (handle: string) =>
  (await q('select status from users where handle = $1', [handle])).rows[0].status as string;
const reportRow = async (id: string) => (await q('select * from reports where id = $1', [id])).rows[0];
const audit = async (event: string) =>
  (await q('select user_id, meta from audit_log where event = $1', [event])).rows;
const liveSessions = async (handle: string) =>
  (
    await q(
      'select count(*)::int n from sessions s join users u on u.id = s.user_id where u.handle = $1 and s.revoked_at is null',
      [handle],
    )
  ).rows[0].n as number;

async function moderator(): Promise<P> {
  const m = await person('mod');
  await makeRole(m.handle, 'moderator');
  return m;
}

/** `reporter` flags `target`; returns the queue item as the moderator sees it. */
async function reported(reporter: P, target: P, mod: P) {
  expect((await report({ handle: target.handle, reason: 'harassment' }, as(reporter))).status).toBe(202);
  const item = (await queue(as(mod))).data.reports!.find((r) => r.target?.handle === target.handle);
  expect(item).toBeDefined();
  return item!;
}

/** `target` nails a card on their own Fence, `reporter` flags it; returns the card id and the queue item. */
async function reportedCard(reporter: P, target: P, mod: P, body = 'Something nasty') {
  const card = await nail(target.handle, { body }, as(target));
  expect(card.status).toBe(201);
  const cardId = card.data.card!.id;
  expect((await flagCard(cardId, { reason: 'inappropriate' }, as(reporter))).status).toBe(202);
  const item = (await queue(as(mod))).data.reports![0]!;
  return { cardId, item };
}

describe('the moderation area is hidden from everyone who is not a moderator', () => {
  it('a member gets the same plain 404 as a page that does not exist, for every endpoint', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    const mod = await moderator();
    const item = await reported(a, b, mod);

    const member = await person('member');
    const missing = await account('nobody_home', as(mod));
    expect(missing.status).toBe(404);
    for (const r of [
      await queue(as(member)),
      await queue(as(member), '?status=dismissed'),
      await actOnReport(item.id, 'dismiss', as(member)),
      await actOnReport(item.id, 'suspend', as(member)),
      await account(b.handle, as(member)),
      await actOnAccount(b.handle, 'suspend', as(member)),
    ]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    // ...and nothing changed
    expect((await reportRow(item.id)).status).toBe('open');
    expect(await statusOf(b.handle)).toBe('active');
  });

  it('signed out is 401; a moderator whose role is taken away loses access at once', async () => {
    const mod = await moderator();
    expect((await queue()).status).toBe(401);
    expect((await queue(as(mod))).status).toBe(200);
    await makeRole(mod.handle, 'member');
    expect((await queue(as(mod))).status).toBe(404);
  });

  it('the role cannot be set through any request body (it is not a field anywhere)', async () => {
    const a = await person('member');
    await report({ handle: (await person('other')).handle, reason: 'spam', role: 'admin' }, as(a));
    expect((await q('select role from users where handle = $1', [a.handle])).rows[0].role).toBe('member');
  });

  it('an admin passes the same gate as a moderator', async () => {
    const admin = await person('admin');
    await makeRole(admin.handle, 'admin');
    expect((await queue(as(admin))).status).toBe(200);
  });
});

describe('the queue', () => {
  it('shows open reports newest first with both people, and filters by status', async () => {
    const mod = await moderator();
    const a = await person('reporter');
    const b = await person('first');
    const c = await person('second');
    await reported(a, b, mod);
    const second = await reported(a, c, mod);

    const open = await queue(as(mod));
    expect(open.data.reports!.map((r) => r.target!.handle)).toEqual([c.handle, b.handle]);
    expect(open.data.reports![0]).toMatchObject({
      reason: 'harassment',
      status: 'open',
      canRemoveCard: false,
      reporter: { handle: a.handle },
      reviewedBy: null,
    });
    // no internal ids leak into the wire format
    expect(open.text).not.toContain(await userId(a.handle));

    await actOnReport(second.id, 'dismiss', as(mod));
    expect((await queue(as(mod))).data.reports!.map((r) => r.target!.handle)).toEqual([b.handle]);
    const dismissed = (await queue(as(mod), '?status=dismissed')).data.reports!;
    expect(dismissed).toHaveLength(1);
    expect(dismissed[0]).toMatchObject({ status: 'dismissed', reviewedBy: { handle: mod.handle } });
  });

  it('pages with a cursor and refuses a bad status or cursor', async () => {
    const mod = await moderator();
    const a = await person('reporter');
    for (let i = 0; i < 3; i++)
      await report({ handle: (await person(`t${i}`)).handle, reason: 'spam' }, as(a));
    const first = await queue(as(mod), '?limit=2');
    expect(first.data.reports).toHaveLength(2);
    expect(first.data.nextCursor).toBeTruthy();
    const rest = await queue(as(mod), `?limit=2&cursor=${encodeURIComponent(first.data.nextCursor!)}`);
    expect(rest.data.reports).toHaveLength(1);
    expect(rest.data.nextCursor).toBeNull();
    expect((await queue(as(mod), '?status=closed')).status).toBe(400);
    expect((await queue(as(mod), '?cursor=nonsense')).status).toBe(400);
  });

  it('a suspended person still shows up in the queue (a moderator must see who they are dealing with)', async () => {
    const mod = await moderator();
    const a = await person('reporter');
    const b = await person('reported');
    const item = await reported(a, b, mod);
    await actOnReport(item.id, 'suspend', as(mod));
    const [row] = (await queue(as(mod), '?status=actioned')).data.reports!;
    expect(row!.target).toMatchObject({ handle: b.handle, status: 'suspended' });
  });
});

describe('acting on a report', () => {
  it('dismiss closes it, records who and when, and writes the audit trail', async () => {
    const mod = await moderator();
    const item = await reported(await person('reporter'), await person('reported'), mod);
    expect((await actOnReport(item.id, 'dismiss', as(mod))).status).toBe(200);
    const row = await reportRow(item.id);
    expect(row.status).toBe('dismissed');
    expect(row.reviewed_by).toBe(await userId(mod.handle));
    expect(row.reviewed_at).toBeInstanceOf(Date);
    expect(await audit('report_dismissed')).toEqual([
      { user_id: await userId(mod.handle), meta: { reportId: item.id } },
    ]);
  });

  it('remove_card takes the card down but keeps the report and its evidence', async () => {
    const mod = await moderator();
    const writer = await person('writer');
    const { cardId, item } = await reportedCard(await person('reporter'), writer, mod, 'Nasty words here');
    expect(item).toMatchObject({ canRemoveCard: true, evidenceText: 'Nasty words here' });

    expect((await actOnReport(item.id, 'remove_card', as(mod))).status).toBe(200);
    expect((await q('select 1 from post_cards where id = $1', [cardId])).rowCount).toBe(0);
    expect((await fenceOf(writer.handle, as(writer))).data.cards).toEqual([]);
    const [kept] = (await queue(as(mod), '?status=actioned')).data.reports!;
    expect(kept).toMatchObject({ id: item.id, evidenceText: 'Nasty words here', canRemoveCard: false });
    expect(await audit('card_removed')).toHaveLength(1);
    // the writer's account is untouched
    expect(await statusOf(writer.handle)).toBe('active');
  });

  it('remove_card on a report about a person (not a card) is refused and changes nothing', async () => {
    const mod = await moderator();
    const item = await reported(await person('reporter'), await person('reported'), mod);
    expect((await actOnReport(item.id, 'remove_card', as(mod))).status).toBe(400);
    expect((await reportRow(item.id)).status).toBe('open');
  });

  it('suspend signs the person out everywhere at once and closes the report', async () => {
    const mod = await moderator();
    const b = await person('reported');
    const item = await reported(await person('reporter'), b, mod);
    expect((await me(b.cookie)).status).toBe(200);
    expect(await liveSessions(b.handle)).toBe(1);

    expect((await actOnReport(item.id, 'suspend', as(mod))).status).toBe(200);
    expect(await statusOf(b.handle)).toBe('suspended');
    expect(await liveSessions(b.handle)).toBe(0);
    expect((await me(b.cookie)).status).toBe(401);
    expect((await reportRow(item.id)).status).toBe('actioned');
    expect(await audit('account_suspended')).toHaveLength(1);
  });

  it('a report that was already closed answers 409, so two moderators cannot both act on it', async () => {
    const mod = await moderator();
    const other = await moderator();
    const { cardId, item } = await reportedCard(await person('reporter'), await person('writer'), mod);
    await actOnReport(item.id, 'dismiss', as(mod));
    const late = await actOnReport(item.id, 'remove_card', as(other));
    expect(late.status).toBe(409);
    // the losing action did nothing: the card is still there and the report keeps the first decision
    expect((await q('select 1 from post_cards where id = $1', [cardId])).rowCount).toBe(1);
    expect(await reportRow(item.id)).toMatchObject({
      status: 'dismissed',
      reviewed_by: await userId(mod.handle),
    });
    expect(await audit('card_removed')).toHaveLength(0);
  });

  it('two moderators racing on the same report: exactly one wins', async () => {
    const mod = await moderator();
    const other = await moderator();
    const b = await person('reported');
    const item = await reported(await person('reporter'), b, mod);
    const results = await Promise.all([
      actOnReport(item.id, 'dismiss', as(mod)),
      actOnReport(item.id, 'suspend', as(other)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const row = await reportRow(item.id);
    // whoever won, the account's state matches the decision recorded on the report
    expect(await statusOf(b.handle)).toBe(row.status === 'actioned' ? 'suspended' : 'active');
  });

  it('an unknown, malformed or foreign report id is a plain 404; an unknown action is 422', async () => {
    const mod = await moderator();
    const item = await reported(await person('reporter'), await person('reported'), mod);
    expect((await actOnReport('00000000-0000-4000-8000-000000000000', 'dismiss', as(mod))).status).toBe(404);
    expect((await actOnReport('../etc', 'dismiss', as(mod))).status).toBe(404);
    expect((await actOnReport(item.id, 'ban_forever', as(mod))).status).toBe(422);
    expect((await reportRow(item.id)).status).toBe('open');
  });

  it('a moderator cannot act on a report about themselves, and staff are never suspended from the queue', async () => {
    const mod = await moderator();
    const other = await moderator();
    const a = await person('reporter');
    expect((await report({ handle: mod.handle, reason: 'harassment' }, as(a))).status).toBe(202);
    const aboutMe = (await queue(as(mod))).data.reports![0]!;
    expect((await actOnReport(aboutMe.id, 'suspend', as(mod))).status).toBe(400);
    expect((await actOnReport(aboutMe.id, 'suspend', as(other))).status).toBe(400);
    expect(await statusOf(mod.handle)).toBe('active');
    // the refused action rolled back as a whole: the report is still open for someone to handle
    expect((await reportRow(aboutMe.id)).status).toBe('open');
    expect((await actOnAccount(other.handle, 'suspend', as(mod))).status).toBe(400);
    expect(await statusOf(other.handle)).toBe('active');
  });
});

describe('acting on an account directly', () => {
  it('looks up anyone, suspended included, without leaking internal ids', async () => {
    const mod = await moderator();
    const b = await person('someone');
    const found = await account(b.handle.toUpperCase(), as(mod));
    expect(found.status).toBe(200);
    expect(found.data.account).toMatchObject({ handle: b.handle, status: 'active' });
    expect(found.text).not.toContain(await userId(b.handle));
    await actOnAccount(b.handle, 'suspend', as(mod));
    expect((await account(b.handle, as(mod))).data.account!.status).toBe('suspended');
  });

  it('suspend and reinstate are idempotent and only audited when something changed', async () => {
    const mod = await moderator();
    const b = await person('someone');
    for (let i = 0; i < 2; i++) expect((await actOnAccount(b.handle, 'suspend', as(mod))).status).toBe(200);
    expect(await audit('account_suspended')).toHaveLength(1);
    for (let i = 0; i < 2; i++) expect((await actOnAccount(b.handle, 'reinstate', as(mod))).status).toBe(200);
    expect(await audit('account_reinstated')).toHaveLength(1);
    expect(await statusOf(b.handle)).toBe('active');
  });

  it('reinstating does not bring an old session back: the person must sign in again', async () => {
    const mod = await moderator();
    const b = await person('someone');
    await actOnAccount(b.handle, 'suspend', as(mod));
    await actOnAccount(b.handle, 'reinstate', as(mod));
    expect((await me(b.cookie)).status).toBe(401);
  });

  it('a moderator cannot suspend themselves; a pending deletion is never turned into a suspension', async () => {
    const mod = await moderator();
    expect((await actOnAccount(mod.handle, 'suspend', as(mod))).status).toBe(400);
    const b = await person('leaving');
    await q("update users set status = 'pending_deletion' where handle = $1", [b.handle]);
    await actOnAccount(b.handle, 'suspend', as(mod));
    expect(await statusOf(b.handle)).toBe('pending_deletion');
    await actOnAccount(b.handle, 'reinstate', as(mod));
    expect(await statusOf(b.handle)).toBe('pending_deletion');
  });

  it('an unknown or malformed handle is a plain 404; an unknown action is 422', async () => {
    const mod = await moderator();
    expect((await account('nobody_home', as(mod))).status).toBe(404);
    expect((await actOnAccount('../x', 'suspend', as(mod))).status).toBe(404);
    expect((await actOnAccount((await person('other')).handle, 'delete', as(mod))).status).toBe(422);
  });
});

describe('limits', () => {
  it('acting is rate limited per moderator (fails closed)', async () => {
    setRateLimiter(new MemoryRateLimiter());
    const mod = await moderator();
    const b = await person('someone');
    for (let i = 0; i < RATE.act.limit; i++) await actOnAccount(b.handle, 'reinstate', as(mod));
    expect((await actOnAccount(b.handle, 'suspend', as(mod))).status).toBe(429);
    expect(await statusOf(b.handle)).toBe('active');
  });

  it('acting on reports shares the same budget, spent even on a report that does not exist', async () => {
    const mod = await moderator();
    const item = await reported(await person('reporter'), await person('reported'), mod);
    const nothing = '00000000-0000-4000-8000-000000000000';
    for (let i = 0; i < RATE.act.limit; i++) await actOnReport(nothing, 'dismiss', as(mod));
    expect((await actOnReport(item.id, 'dismiss', as(mod))).status).toBe(429);
    expect((await reportRow(item.id)).status).toBe('open');
  });
});
