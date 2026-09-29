import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_HOLD_REPORTERS, NEW_ACCOUNT_RATE } from '@/modules/moderation/anti-spam';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import { fenceOf, nail, replyTo, waiting, yo } from '../helpers/fence';
import { actOnReport, makeRole, queue } from '../helpers/moderation';
import { doAct, q, report } from '../helpers/social';
import { create as createTownHall } from '../helpers/town-halls';

/** ADR-024: new-account budgets, and holding someone's words on other Fences after many reports. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  setRateLimiter(new MemoryRateLimiter());
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof signedInUser>>;
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
/** A brand-new account (created just now). */
const newcomer = (tag: string) => signedInUser(kit, uniqueUser(tag));
/** An account old enough to be past its first week. */
async function regular(tag: string): Promise<P> {
  const p = await signedInUser(kit, uniqueUser(tag));
  await q("update users set created_at = now() - interval '30 days' where handle = $1", [p.handle]);
  return p;
}
/** A Fence anyone signed in may write on. */
async function openFence(tag = 'owner'): Promise<P> {
  const p = await regular(tag);
  await q(
    "update profiles set fence_posting = 'members' where user_id = (select id from users where handle = $1)",
    [p.handle],
  );
  return p;
}
const cardStatus = async (id: string) =>
  (await q('select status from post_cards where id = $1', [id])).rows[0].status as string;
const replyStatus = async (id: string) =>
  (await q('select status from card_replies where id = $1', [id])).rows[0].status as string;

describe('new accounts have tighter daily budgets', () => {
  it('Post Cards: a new account stops at its daily budget; an older one does not', async () => {
    const fresh = await newcomer('fresh');
    const old = await regular('old');
    // on their own Fences, so no other limit gets in the way first
    for (let i = 0; i < NEW_ACCOUNT_RATE.card.limit; i++) {
      expect((await nail(fresh.handle, { body: `hello ${i}` }, as(fresh))).status).toBe(201);
    }
    expect((await nail(fresh.handle, { body: 'one more' }, as(fresh))).status).toBe(429);
    for (let i = 0; i <= NEW_ACCOUNT_RATE.card.limit; i++) {
      expect((await nail(old.handle, { body: `hello ${i}` }, as(old))).status).toBe(201);
    }
  });

  it('the budget is spent before the Fence is looked up: a made-up call sign costs the same', async () => {
    const fresh = await newcomer('fresh');
    for (let i = 0; i < NEW_ACCOUNT_RATE.card.limit; i++) {
      expect((await nail('nobody_home_here', { body: 'hi' }, as(fresh))).status).toBe(404);
    }
    expect((await nail(fresh.handle, { body: 'hi' }, as(fresh))).status).toBe(429);
  });

  it('Pal requests', async () => {
    const fresh = await newcomer('fresh');
    for (let i = 0; i < NEW_ACCOUNT_RATE.palRequest.limit; i++) {
      const other = await regular(`target${i}`);
      expect((await doAct(other.handle, 'request', as(fresh))).status).toBe(200);
    }
    const last = await regular('last');
    expect((await doAct(last.handle, 'request', as(fresh))).status).toBe(429);
  });

  it('reactions', async () => {
    const owner = await openFence();
    const card = (await nail(owner.handle, { body: 'react to me' }, as(owner))).data.card!.id;
    const fresh = await newcomer('fresh');
    for (let i = 0; i < NEW_ACCOUNT_RATE.reaction.limit; i++) await yo(card, i % 2 === 0, as(fresh));
    expect((await yo(card, true, as(fresh))).status).toBe(429);
  });

  it('Town Halls: one a day while new', async () => {
    const fresh = await newcomer('fresh');
    const hall = (n: number) => ({ name: `Hall ${n}`, description: 'A place', visibility: 'open' });
    expect((await createTownHall(hall(1), as(fresh))).status).toBe(201);
    expect((await createTownHall(hall(2), as(fresh))).status).toBe(429);
  });

  it('the budget lifts by itself once the first week is over', async () => {
    const fresh = await newcomer('fresh');
    for (let i = 0; i < NEW_ACCOUNT_RATE.card.limit; i++)
      await nail(fresh.handle, { body: `x${i}` }, as(fresh));
    expect((await nail(fresh.handle, { body: 'blocked' }, as(fresh))).status).toBe(429);
    await q("update users set created_at = now() - interval '8 days' where handle = $1", [fresh.handle]);
    expect((await nail(fresh.handle, { body: 'free again' }, as(fresh))).status).toBe(201);
  });
});

describe('links (already refused in public text, so there is nothing to hold)', () => {
  it('a card or reply with a link is refused for everyone, new or old', async () => {
    const owner = await openFence();
    const card = (await nail(owner.handle, { body: 'say hi' }, as(owner))).data.card!.id;
    for (const writer of [await newcomer('fresh'), await regular('old')]) {
      expect((await nail(owner.handle, { body: 'free coins at spam.xyz' }, as(writer))).status).toBe(422);
      expect((await replyTo(card, { body: 'visit www.scam-site' }, as(writer))).status).toBe(422);
    }
  });
});

describe('what a held card looks like', () => {
  it('looks posted to its writer; the owner sees it waiting; nobody else sees it', async () => {
    const owner = await openFence();
    const target = await regular('target');
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++) {
      await report({ handle: target.handle, reason: 'spam' }, as(await regular(`r${i}`)));
    }
    const r = await nail(owner.handle, { body: 'held one' }, as(target));
    expect(r.status).toBe(201);
    expect(r.data.card!.waiting).toBe(false);
    expect(((await waiting(as(owner))).data.cards as { id: string }[]).map((c) => c.id)).toContain(
      r.data.card!.id,
    );
    const seen = (await fenceOf(owner.handle, as(await regular('passerby')))).data.cards!.map((c) => c.id);
    expect(seen).not.toContain(r.data.card!.id);
  });

  it('a Fence with Review on still says "waiting" honestly (pending wins over held)', async () => {
    const owner = await openFence();
    await q(
      'update profiles set fence_review = true where user_id = (select id from users where handle = $1)',
      [owner.handle],
    );
    const target = await regular('target');
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++) {
      await report({ handle: target.handle, reason: 'spam' }, as(await regular(`r${i}`)));
    }
    const r = await nail(owner.handle, { body: 'hello' }, as(target));
    expect(await cardStatus(r.data.card!.id)).toBe('pending');
  });
});

describe('many reports hold what someone writes on other Fences until a moderator looks', () => {
  async function reportedBy(n: number, target: P) {
    for (let i = 0; i < n; i++) {
      const reporter = await regular(`reporter${i}`);
      expect((await report({ handle: target.handle, reason: 'spam' }, as(reporter))).status).toBe(202);
    }
  }

  it(`${AUTO_HOLD_REPORTERS} different reporters: new cards and replies are held; one fewer: not`, async () => {
    const owner = await openFence();
    const target = await regular('target');
    await reportedBy(AUTO_HOLD_REPORTERS - 1, target);
    const before = await nail(owner.handle, { body: 'still fine' }, as(target));
    expect(await cardStatus(before.data.card!.id)).toBe('published');

    await reportedBy(1, target);
    const after = await nail(owner.handle, { body: 'now held' }, as(target));
    expect(after.status).toBe(201);
    expect(after.data.card!.waiting).toBe(false);
    expect(await cardStatus(after.data.card!.id)).toBe('held');
    const reply = await replyTo(before.data.card!.id, { body: 'a reply' }, as(target));
    expect(await replyStatus(reply.data.reply!.id)).toBe('held');
    // Earlier cards stay as they were; their own Fence is unaffected.
    expect(await cardStatus(before.data.card!.id)).toBe('published');
    const own = await nail(target.handle, { body: 'my own wall' }, as(target));
    expect(await cardStatus(own.data.card!.id)).toBe('published');
  });

  it('the same person reporting twice counts once', async () => {
    const owner = await openFence();
    const target = await regular('target');
    const reporter = await regular('reporter');
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++) {
      await report({ handle: target.handle, reason: 'spam' }, as(reporter));
    }
    const r = await nail(owner.handle, { body: 'hi' }, as(target));
    expect(await cardStatus(r.data.card!.id)).toBe('published');
  });

  it('the hold lifts as soon as a moderator closes the reports; the queue shows who is being held', async () => {
    const owner = await openFence();
    const target = await regular('target');
    const mod = await regular('mod');
    await makeRole(mod.handle, 'moderator');
    await reportedBy(AUTO_HOLD_REPORTERS, target);
    const items = (await queue(as(mod))).data.reports!.filter((r) => r.target?.handle === target.handle);
    expect(items).toHaveLength(AUTO_HOLD_REPORTERS);
    expect(items.every((r) => r.targetHeld === true)).toBe(true);
    await actOnReport(items[0]!.id, 'dismiss', as(mod));
    const r = await nail(owner.handle, { body: 'free to post' }, as(target));
    expect(await cardStatus(r.data.card!.id)).toBe('published');
  });

  it('old reports (more than a week) no longer count', async () => {
    const owner = await openFence();
    const target = await regular('target');
    await reportedBy(AUTO_HOLD_REPORTERS, target);
    await q(
      "update reports set created_at = now() - interval '8 days' where target_user_id = (select id from users where handle = $1)",
      [target.handle],
    );
    const r = await nail(owner.handle, { body: 'hi' }, as(target));
    expect(await cardStatus(r.data.card!.id)).toBe('published');
  });
});
