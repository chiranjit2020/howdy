import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { giveMarkTo, marksOf } from '../helpers/marks';
import { patchRanch } from '../helpers/ranch';
import { doAct, q } from '../helpers/social';
import { act, create } from '../helpers/town-halls';
import { leaveTribute, tributesOf } from '../helpers/tributes';

/**
 * ADR-054: groups are circles of people who know each other, so sharing one grants nothing on its own. Group
 * "neighbours" (ADR-044: members of one group for 14+ days) could describe each other and leave testimonials; now only
 * friends can, however long two people have shared a group.
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

/** A group with both of them in it, members for a month. */
async function shareAGroup(a: P, b: P) {
  const r = await create(
    { name: 'Profile Talk', description: 'Chatting on the porch.', visibility: 'open' },
    as(a),
  );
  const id = r.data.townHall!.id as string;
  expect((await act(id, 'join', as(b))).status).toBe(200);
  await q("update town_hall_members set joined_at = now() - interval '30 days' where town_hall_id = $1", [
    id,
  ]);
}

describe('sharing a group grants nothing (ADR-054)', () => {
  it('a month in the same group: no word, no testimonial', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await patchRanch({ ranchVisibility: 'everyone' }, as(ann));
    await shareAGroup(ann, bob);
    expect((await marksOf(ann.handle, as(bob))).data.canGive).toBe(false);
    expect((await tributesOf(ann.handle, as(bob))).data.canGive).toBe(false);
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(403);
    expect((await leaveTribute(ann.handle, { body: 'Kindest person in the group.' }, as(bob))).status).toBe(
      403,
    );
  });

  it('friends still can, group or no group', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await shareAGroup(ann, bob);
    await doAct(ann.handle, 'request', as(bob));
    await doAct(bob.handle, 'accept', as(ann));
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(201);
    expect((await leaveTribute(ann.handle, { body: 'Kindest person I know.' }, as(bob))).status).toBe(201);
  });
});
