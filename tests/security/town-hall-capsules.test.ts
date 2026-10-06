import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_HOLD_REPORTERS } from '@/modules/moderation/anti-spam';
import { openHallCapsules } from '@/modules/town-halls';
import { getPool } from '@/platform/db';
import { addDays, addYears, dayOf } from '@/shared/calendar';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { feed, held } from '../helpers/hall-feed';
import { q, report } from '../helpers/social';
import {
  act,
  ban,
  create,
  hallCapsules,
  memberAction,
  remove,
  sealHall,
  takeBackHall,
} from '../helpers/town-halls';

/** ADR-043: Time Capsules for a whole Town Hall — sealed by staff, opened as a post on the day. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });

const tomorrow = () => addDays(dayOf(), 1);
const WORDS = 'See you all next spring, porch folk.';

/** A Town Hall with an owner, a Deputy and an ordinary member. */
async function staffed() {
  const owner = await person('owner');
  const dep = await person('dep');
  const ann = await person('ann');
  const r = await create(
    { name: 'Porch Talk', description: 'Chatting on the porch.', visibility: 'open' },
    as(owner),
  );
  const id = r.data.townHall!.id as string;
  for (const j of [dep, ann]) expect((await act(id, 'join', as(j))).status).toBe(200);
  expect((await memberAction(id, dep.handle, 'make_deputy', as(owner))).status).toBe(200);
  return { owner, dep, ann, id };
}

async function seal(id: string, by: P, body = WORDS, openOn = tomorrow()): Promise<string> {
  const r = await sealHall(id, { body, openOn }, as(by));
  expect(r.status).toBe(201);
  return (r.data as { capsule: { id: string } }).capsule.id;
}

/** Make every waiting capsule due today. */
const dueNow = () => q(`update town_hall_capsules set open_on = $1`, [dayOf()]);

const capsulePosts = (id: string) =>
  q(
    `select author_id, body, status, capsule_sealed_at from town_hall_posts where town_hall_id = $1 and capsule_sealed_at is not null`,
    [id],
  );

describe('sealing', () => {
  it('only the owner or a Deputy may seal one; everyone else gets the same 404', async () => {
    const { owner, dep, ann, id } = await staffed();
    const stranger = await person('stranger');
    await seal(id, owner);
    await seal(id, dep);
    expect((await sealHall(id, { body: WORDS, openOn: tomorrow() }, as(ann))).status).toBe(404);
    expect((await sealHall(id, { body: WORDS, openOn: tomorrow() }, as(stranger))).status).toBe(404);
    expect(
      (await sealHall('00000000-0000-4000-8000-000000000000', { body: WORDS, openOn: tomorrow() }, as(owner)))
        .status,
    ).toBe(404);
  });

  it('a day from tomorrow to 5 years, and a post’s rules for the words', async () => {
    const { owner, id } = await staffed();
    const today = dayOf();
    for (const openOn of [today, addDays(addYears(today, 5), 1), '2027-02-30']) {
      const r = await sealHall(id, { body: WORDS, openOn }, as(owner));
      expect(r.status).toBe(422);
      expect(r.data.error!.fields).toHaveProperty('openOn');
    }
    await seal(id, owner, WORDS, addYears(today, 5));
    expect((await sealHall(id, { body: 'x'.repeat(281), openOn: tomorrow() }, as(owner))).status).toBe(422);
    expect(
      (await sealHall(id, { body: 'see https://example.com', openOn: tomorrow() }, as(owner))).status,
    ).toBe(422);
  });

  it('at most 10 waiting per Town Hall', async () => {
    const { owner, dep, id } = await staffed();
    for (let i = 0; i < 5; i++) await seal(id, owner);
    for (let i = 0; i < 5; i++) await seal(id, dep);
    expect((await sealHall(id, { body: WORDS, openOn: tomorrow() }, as(owner))).status).toBe(409);
  });
});

describe('sealed means sealed', () => {
  it('members see who and when — never the words, not even the writer; outsiders see nothing', async () => {
    const { owner, dep, ann, id } = await staffed();
    await seal(id, dep);
    for (const p of [owner, dep, ann]) {
      const r = await hallCapsules(id, as(p));
      expect(r.status).toBe(200);
      expect(r.data.capsules!.map((c) => [c.from?.handle, c.openOn])).toEqual([[dep.handle, tomorrow()]]);
      expect(r.text).not.toContain(WORDS);
      expect((await feed(id, as(p))).text).not.toContain(WORDS);
    }
    const stranger = await person('stranger');
    expect((await hallCapsules(id, as(stranger))).status).toBe(404);
    expect((await hallCapsules('not-an-id', as(owner))).status).toBe(404);
  });
});

describe('opening', () => {
  it('on its day it becomes one post in the feed, marked with when it was sealed', async () => {
    const { owner, dep, ann, id } = await staffed();
    await seal(id, dep);
    // Not before its day.
    expect((await feed(id, as(ann))).text).not.toContain(WORDS);
    await dueNow();
    // Several members looking at once still make exactly one post.
    const pages = await Promise.all([feed(id, as(ann)), feed(id, as(owner)), feed(id, as(dep))]);
    for (const page of pages) {
      const posts = page.data.posts as unknown as {
        body: string;
        author: { handle: string };
        capsuleSealedAt: string | null;
      }[];
      const opened = posts.filter((p) => p.capsuleSealedAt);
      expect(opened.map((p) => [p.body, p.author.handle])).toEqual([[WORDS, dep.handle]]);
    }
    expect((await capsulePosts(id)).rows).toHaveLength(1);
    expect((await hallCapsules(id, as(ann))).data.capsules).toEqual([]);
  });

  it('opens even if the writer has left or been banned since', async () => {
    const { owner, dep, ann, id } = await staffed();
    await seal(id, dep);
    await seal(id, owner, 'From the owner.');
    await memberAction(id, dep.handle, 'make_member', as(owner));
    expect((await ban(id, dep.handle, as(owner))).status).toBe(200);
    await dueNow();
    const bodies = ((await feed(id, as(ann))).data.posts as { body: string }[]).map((p) => p.body);
    expect(bodies).toEqual(expect.arrayContaining([WORDS, 'From the owner.']));
  });

  it('a writer who is no longer staff and is being reported a lot is held, like any post', async () => {
    const { owner, dep, ann, id } = await staffed();
    await seal(id, dep);
    await memberAction(id, dep.handle, 'make_member', as(owner));
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++)
      await report({ handle: dep.handle, reason: 'spam' }, as(await person(`r${i}`)));
    await dueNow();
    expect((await feed(id, as(ann))).text).not.toContain(WORDS);
    expect((await capsulePosts(id)).rows.map((r) => r.status)).toEqual(['held']);
    expect(((await held(id, as(owner))).data.posts as { body: string }[]).map((p) => p.body)).toEqual([
      WORDS,
    ]);
  });

  it('a suspended writer makes it wait; the daily job opens it once they are back', async () => {
    const { owner, dep, ann, id } = await staffed();
    await seal(id, dep);
    await dueNow();
    await q(`update users set status = 'suspended' where handle = $1`, [dep.handle]);
    expect((await feed(id, as(ann))).text).not.toContain(WORDS);
    expect((await q(`select count(*)::int n from town_hall_capsules`)).rows[0].n).toBe(1);
    await q(`update users set status = 'active' where handle = $1`, [dep.handle]);
    expect((await openHallCapsules()).hallCapsulesOpened).toBe(1);
    expect((await feed(id, as(owner))).text).toContain(WORDS);
  });
});

describe('taking one back', () => {
  it('the writer may, and the owner over a Deputy — not a Deputy over the owner, not a member', async () => {
    const { owner, dep, ann, id } = await staffed();
    const fromDep = await seal(id, dep);
    const fromOwner = await seal(id, owner);
    const another = await seal(id, dep);
    expect((await takeBackHall(id, fromOwner, as(dep))).status).toBe(404);
    expect((await takeBackHall(id, fromDep, as(ann))).status).toBe(404);
    const flags = (await hallCapsules(id, as(dep))).data.capsules!.map((c) => [c.id, c.canTakeBack] as const);
    expect(new Map(flags)).toEqual(
      new Map([
        [fromDep, true],
        [fromOwner, false],
        [another, true],
      ]),
    );
    expect((await takeBackHall(id, fromDep, as(dep))).status).toBe(200);
    expect((await takeBackHall(id, another, as(owner))).status).toBe(200);
    // Under the wrong Town Hall, it is not found.
    const { id: other, owner: otherOwner } = await staffed();
    expect((await takeBackHall(other, fromOwner, as(otherOwner))).status).toBe(404);
    // …even for its own writer, who is staff in both.
    await act(other, 'join', as(owner));
    await memberAction(other, owner.handle, 'make_deputy', as(otherOwner));
    expect((await takeBackHall(other, fromOwner, as(owner))).status).toBe(404);
    expect((await hallCapsules(id, as(ann))).data.capsules!.map((c) => c.id)).toEqual([fromOwner]);
  });
});

describe('when things go', () => {
  it("the writer's account or the Town Hall takes its capsules with it", async () => {
    const { owner, dep, id } = await staffed();
    await seal(id, dep);
    await seal(id, owner);
    await q(`delete from users where handle = $1`, [dep.handle]);
    expect((await q(`select count(*)::int n from town_hall_capsules`)).rows[0].n).toBe(1);
    expect((await remove(id, as(owner))).status).toBe(200);
    expect((await q(`select count(*)::int n from town_hall_capsules`)).rows[0].n).toBe(0);
  });
});
