import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { townHallsExport } from '@/modules/town-halls';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { createEvent, feed, post, removePost, rsvp, type HallPost } from '../helpers/hall-feed';
import { doAct, q, userId } from '../helpers/social';
import { act, create } from '../helpers/town-halls';

/**
 * Events in a group (ADR-056): any member posts one; members answer going, maybe or can't go; everyone sees how many,
 * only the organiser sees who. Answers count only from current members, close when it starts, and go with the post.
 */

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
const DAY = 24 * 60 * 60 * 1000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

async function hall(owner: P, members: P[] = []): Promise<string> {
  const id = (
    await create(
      { name: 'Batch of 2019', description: 'Reunions and old jokes.', visibility: 'open' },
      as(owner),
    )
  ).data.townHall!.id as string;
  for (const m of members) expect((await act(id, 'join', as(m))).status).toBe(200);
  return id;
}
const event = async (hallId: string, who: P, extra: Record<string, unknown> = {}) => {
  const r = await createEvent(
    hallId,
    { title: 'Reunion dinner', startsAt: inDays(7), place: 'College canteen', ...extra },
    as(who),
  );
  expect(r.status, JSON.stringify(r.data)).toBe(201);
  return r.data.post as HallPost;
};
const seen = async (hallId: string, who: P, postId: string) =>
  (await feed(hallId, as(who))).data.posts!.find((p) => p.id === postId)!.event!;

describe('posting an event', () => {
  it('any member posts one; it is a post in the feed with its event, its name standing in for missing details', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await event(id, ann);
    expect(made.body).toBe('Reunion dinner');
    expect(made.event).toMatchObject({
      title: 'Reunion dinner',
      place: 'College canteen',
      counts: { going: 0, maybe: 0, no: 0 },
      mine: null,
      closed: false,
    });
    expect((await seen(id, owner, made.id)).title).toBe('Reunion dinner');
  });

  it('refuses a time in the past, more than a year ahead, a short name, and links', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    for (const bad of [
      { title: 'Reunion dinner', startsAt: inDays(-1) },
      { title: 'Reunion dinner', startsAt: inDays(400) },
      { title: 'Reunion dinner', startsAt: 'next Sunday' },
      { title: 'Re', startsAt: inDays(7) },
      { title: 'Reunion dinner', startsAt: inDays(7), place: 'tickets at example.com' },
      { title: 'Reunion dinner', startsAt: inDays(7), details: 'Book at https://example.com' },
    ]) {
      expect((await createEvent(id, bad, as(owner))).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await q('select count(*)::int n from town_hall_events')).rows[0].n).toBe(0);
  });

  it('a non-member can neither post one nor answer one (the same 404 as a missing group or post)', async () => {
    const owner = await person('owner');
    const stranger = await person('stranger');
    const id = await hall(owner);
    expect((await createEvent(id, { title: 'Gatecrash', startsAt: inDays(3) }, as(stranger))).status).toBe(
      404,
    );
    const made = await event(id, owner);
    expect((await rsvp(made.id, 'going', as(stranger))).status).toBe(404);
  });
});

describe('answering', () => {
  it('members answer, change and take back; everyone sees the counts, only the organiser sees who', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await event(id, owner);
    expect((await rsvp(made.id, 'going', as(ann))).status).toBe(200);
    expect((await rsvp(made.id, 'maybe', as(bob))).status).toBe(200);
    expect((await rsvp(made.id, 'no', as(bob))).status).toBe(200); // changed
    const forAnn = await seen(id, ann, made.id);
    expect(forAnn).toMatchObject({ counts: { going: 1, maybe: 0, no: 1 }, mine: 'going', answers: null });
    const forOwner = await seen(id, owner, made.id);
    expect(forOwner.answers!.going.map((p) => p.handle)).toEqual([ann.handle]);
    expect(forOwner.answers!.no.map((p) => p.handle)).toEqual([bob.handle]);
    expect((await rsvp(made.id, null, as(ann))).status).toBe(200); // taken back
    expect((await seen(id, ann, made.id)).counts.going).toBe(0);
    expect((await rsvp(made.id, 'sure', as(ann))).status).toBe(422);
  });

  it('only current members count: someone who leaves stops counting', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await event(id, owner);
    await rsvp(made.id, 'going', as(ann));
    expect((await seen(id, owner, made.id)).counts.going).toBe(1);
    await act(id, 'leave', as(ann));
    expect((await seen(id, owner, made.id)).counts.going).toBe(0);
    expect((await seen(id, owner, made.id)).answers!.going).toEqual([]);
  });

  it('closes when it starts; a post that is not an event cannot be answered', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await event(id, owner);
    await q("update town_hall_events set starts_at = now() - interval '1 hour' where post_id = $1", [
      made.id,
    ]);
    expect((await rsvp(made.id, 'going', as(ann))).status).toBe(400);
    expect((await seen(id, ann, made.id)).closed).toBe(true);
    const plain = (await post(id, { body: 'Just a post' }, as(owner))).data.post!.id;
    expect((await rsvp(plain, 'going', as(ann))).status).toBe(404);
  });

  it('the organiser’s list leaves out anyone they have muted (still counted); a muted organiser’s event is hidden', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    const made = await event(id, owner);
    await rsvp(made.id, 'going', as(ann));
    await rsvp(made.id, 'going', as(bob));
    await doAct(bob.handle, 'mute', as(owner));
    const forOwner = await seen(id, owner, made.id);
    expect(forOwner.counts.going).toBe(2);
    expect(forOwner.answers!.going.map((p) => p.handle)).toEqual([ann.handle]);
    await doAct(owner.handle, 'mute', as(ann));
    expect((await feed(id, as(ann))).data.posts!.some((p) => p.id === made.id)).toBe(false);
  });
});

describe('what goes with it', () => {
  it('taking the post down takes the event and every answer', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await event(id, owner);
    await rsvp(made.id, 'going', as(ann));
    expect((await removePost(made.id, as(owner))).status).toBe(200);
    expect((await q('select count(*)::int n from town_hall_events')).rows[0].n).toBe(0);
    expect((await q('select count(*)::int n from town_hall_rsvps')).rows[0].n).toBe(0);
  });

  it('"Download my data" includes my events and my answers', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await event(id, owner);
    await rsvp(made.id, 'maybe', as(ann));
    const mine = await townHallsExport(await userId(owner.handle));
    expect(mine[0]!.posts[0]!.event).toMatchObject({ title: 'Reunion dinner', place: 'College canteen' });
    const anns = await townHallsExport(await userId(ann.handle));
    expect(anns[0]!.eventAnswers).toEqual([
      expect.objectContaining({ event: 'Reunion dinner', answer: 'maybe' }),
    ]);
  });
});
