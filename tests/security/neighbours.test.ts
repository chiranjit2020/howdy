import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPool } from '@/platform/db';
import { freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { giveMarkTo, marksOf } from '../helpers/marks';
import { patchRanch } from '../helpers/ranch';
import { doAct, q } from '../helpers/social';
import { act, ban, create, invite, memberAction, update } from '../helpers/town-halls';
import { leaveTribute, tributesOf } from '../helpers/tributes';
import { whisper } from '../helpers/whispers';

/** ADR-044: Town Hall neighbours (both active members of one Town Hall for 14+ days) may give Tributes and Marks. */

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
const open = (p: P) => patchRanch({ ranchVisibility: 'everyone' }, as(p));
const idOf = async (p: P) =>
  (await q('select id from users where handle = $1', [p.handle])).rows[0].id as string;

/** Move one person's membership of a Town Hall back by `days` (when they became a member). */
async function memberFor(hall: string, p: P, days: number) {
  await q(
    `update town_hall_members set joined_at = now() - ($3 || ' days')::interval
      where town_hall_id = $1 and user_id = (select id from users where handle = $2)`,
    [hall, p.handle, days],
  );
}

/** A Town Hall with `owner` and `others` in it; everyone a member for `days`. */
async function hallWith(owner: P, others: P[], days = 15): Promise<string> {
  const r = await create(
    { name: 'Porch Talk', description: 'Chatting on the porch.', visibility: 'open' },
    as(owner),
  );
  const id = r.data.townHall!.id as string;
  for (const p of others) expect((await act(id, 'join', as(p))).status).toBe(200);
  for (const p of [owner, ...others]) await memberFor(id, p, days);
  return id;
}

const canGive = async (target: P, viewer: P) => ({
  mark: (await marksOf(target.handle, as(viewer))).data.canGive,
  tribute: (await tributesOf(target.handle, as(viewer))).data.canGive,
});

describe('who counts as a neighbour', () => {
  it('two members of one Town Hall for 14+ days may give each other a Mark and a Tribute', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    await hallWith(ann, [bob]);
    expect(await canGive(ann, bob)).toEqual({ mark: true, tribute: true });
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(201);
    const t = await leaveTribute(ann.handle, { body: 'Kindest person in the hall.' }, as(bob));
    expect(t.status).toBe(201);
    // A Tribute still waits for the owner's approval, as from a Pal.
    expect((t.data as { tribute: { waiting: boolean } }).tribute.waiting).toBe(true);
  });

  it('not before 14 days — and both of them must have been members that long', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    const hall = await hallWith(ann, [bob], 13);
    expect(await canGive(ann, bob)).toEqual({ mark: false, tribute: false });
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(403);
    expect((await leaveTribute(ann.handle, { body: 'Too soon?' }, as(bob))).status).toBe(403);
    await memberFor(hall, bob, 30);
    expect((await canGive(ann, bob)).mark).toBe(false); // ann is still at 13 days
    await memberFor(hall, ann, 14);
    expect(await canGive(ann, bob)).toEqual({ mark: true, tribute: true });
  });

  it('counts from becoming a member, not from asking or being invited', async () => {
    const ann = await person('ann');
    const asker = await person('asker');
    const invitee = await person('invitee');
    await open(asker);
    await open(invitee);
    const hall = await hallWith(ann, [], 30);
    await update(hall, { joinRule: 'approval' }, as(ann));
    await act(hall, 'join', as(asker));
    await invite(hall, invitee.handle, as(ann));
    // Both waited 20 days before getting in.
    await q(
      `update town_hall_members set created_at = now() - interval '20 days' where town_hall_id = $1 and status <> 'active'`,
      [hall],
    );
    await memberAction(hall, asker.handle, 'approve', as(ann));
    await act(hall, 'accept', as(invitee));
    expect((await canGive(asker, ann)).mark).toBe(false);
    expect((await canGive(invitee, ann)).mark).toBe(false);
  });

  it('ends on leaving or being banned, and an invite or request never counts', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const cat = await person('cat');
    const dan = await person('dan');
    await open(ann);
    const hall = await hallWith(ann, [bob, cat]);
    await invite(hall, dan.handle, as(ann));
    await q(`update town_hall_members set created_at = now() - interval '30 days' where status = 'invited'`);
    expect((await canGive(ann, dan)).mark).toBe(false);
    await act(hall, 'leave', as(bob));
    expect((await canGive(ann, bob)).mark).toBe(false);
    await ban(hall, cat.handle, as(ann));
    expect((await canGive(ann, cat)).mark).toBe(false);
  });

  it('members of DIFFERENT Town Halls are not neighbours', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    await hallWith(ann, []);
    await hallWith(bob, []);
    expect(await canGive(ann, bob)).toEqual({ mark: false, tribute: false });
  });
});

describe('what being neighbours does not change', () => {
  it('a block either way beats it', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    await hallWith(ann, [bob]);
    await doAct(ann.handle, 'block', as(bob));
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(404);
    await doAct(ann.handle, 'unblock', as(bob));
    await doAct(bob.handle, 'block', as(ann));
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(404);
  });

  it('a Porch hidden from them stays hidden: nothing to give on', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await patchRanch({ ranchVisibility: 'posse' }, as(ann));
    await hallWith(ann, [bob]);
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(404);
  });

  it('Whispers stay Pals-only', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    await hallWith(ann, [bob]);
    const r = await whisper(ann.handle, 'howdy neighbour', as(bob));
    expect(r.status).toBeGreaterThanOrEqual(400);
  });

  it('the 30-day Mark cooldown still applies', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    await open(ann);
    await hallWith(ann, [bob]);
    expect((await giveMarkTo(ann.handle, 'gem', as(bob))).status).toBe(201);
    expect((await giveMarkTo(ann.handle, 'pure', as(bob))).status).toBe(409);
  });
});

describe('which Marks are from a Pal', () => {
  it('a neighbour’s Mark is recorded as not from a Pal; a Pal’s (even one in the same hall) is', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const pal = await person('pal');
    await open(ann);
    await hallWith(ann, [bob, pal]);
    await doAct(ann.handle, 'request', as(pal));
    await doAct(pal.handle, 'accept', as(ann));
    await giveMarkTo(ann.handle, 'gem', as(bob));
    await giveMarkTo(ann.handle, 'pure', as(pal));
    const { rows } = await q('select rater_id, from_pal from marks where target_id = $1', [await idOf(ann)]);
    const byRater = new Map(rows.map((r) => [r.rater_id as string, r.from_pal as boolean]));
    expect(byRater.get(await idOf(bob))).toBe(false);
    expect(byRater.get(await idOf(pal))).toBe(true);
  });
});
