import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-photo/route';
import { GET as modPhotoRoute } from '@/app/api/moderation/reports/[id]/card-photo/route';
import { GET as ofRoute } from '@/app/api/porch/[handle]/stories/route';
import { POST as reportRoute } from '@/app/api/reports/story/[id]/route';
import { DELETE as removeRoute } from '@/app/api/stories/[id]/route';
import { GET as photoRoute } from '@/app/api/stories/[id]/photo/route';
import { POST as reactRoute } from '@/app/api/stories/[id]/react/route';
import { POST as viewRoute } from '@/app/api/stories/[id]/view/route';
import { GET as ringRoute, POST as postRoute } from '@/app/api/stories/route';
import { buildDataExport } from '@/app/_lib/data-export';
import { purgeDetachedCardPhotos } from '@/modules/media';
import { MAX_LIVE_STORIES, purgeExpiredStories, storyPhotoFor } from '@/modules/stories';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, request, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { bell, markRead, types } from '../helpers/chimes';
import { nail } from '../helpers/fence';
import { freshStore, jpeg, sendToStorage } from '../helpers/media';
import { actOnReport, makeRole, queue } from '../helpers/moderation';
import { patchRanch } from '../helpers/ranch';
import { doAct, q, userId } from '../helpers/social';

/** ADR-047: Stories — a photo for my Pals (or Close Pals) for 12 hours; who sees it, who is told, and that it goes. */

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;
beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
});
afterEach(async () => {
  await storage.cleanup();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const NOPE = '00000000-0000-4000-8000-000000000000';

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

async function photoOf(p: P): Promise<string> {
  const file = await jpeg(900, 1600);
  const start = await call(
    startRoute,
    'POST',
    '/api/me/card-photo',
    { contentType: 'image/jpeg', size: file.length },
    as(p),
  );
  expect(start.status).toBe(201);
  expect((await sendToStorage((start.data.upload as { url: string }).url, file, 'image/jpeg')).status).toBe(
    204,
  );
  const done = await call(finishRoute, 'PUT', '/api/me/card-photo', { mediaId: start.data.mediaId }, as(p));
  expect(done.status).toBe(200);
  return start.data.mediaId as string;
}

const postRaw = (p: P, body: Record<string, unknown>) => call(postRoute, 'POST', '/api/stories', body, as(p));
async function story(p: P, body: Record<string, unknown> = {}): Promise<string> {
  const r = await postRaw(p, { photoId: await photoOf(p), ...body });
  expect(r.status).toBe(201);
  return (r.data as { story: { id: string } }).story.id;
}

interface Item {
  id: string;
  caption: string | null;
  mine: boolean;
  myReaction: string | null;
  audience: string | null;
  viewers: { person: { handle: string }; reaction: string | null }[] | null;
  reactions: { person: { handle: string }; reaction: string | null }[] | null;
}
type Handler = (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
/** Call a route that takes a path parameter. */
async function send(
  handler: Handler,
  method: string,
  path: string,
  params: Record<string, string>,
  body: unknown,
  viewer: P,
) {
  const res = await handler(request(method, path, body, as(viewer)), { params: Promise.resolve(params) });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, text };
}

async function storiesOf(
  viewer: P,
  owner: { handle: string },
): Promise<{ status: number; items: Item[]; text: string }> {
  const r = await send(
    ofRoute,
    'GET',
    `/api/porch/${owner.handle}/stories`,
    { handle: owner.handle },
    undefined,
    viewer,
  );
  return { status: r.status, items: (r.data as { stories?: Item[] }).stories ?? [], text: r.text };
}
async function ring(viewer: P) {
  const r = await call(ringRoute, 'GET', '/api/stories', undefined, as(viewer));
  expect(r.status).toBe(200);
  return (r.data as { ring: { person: { handle: string }; mine: boolean; unseen: boolean; count: number }[] })
    .ring;
}
const view = (id: string, viewer: P) =>
  send(viewRoute, 'POST', `/api/stories/${id}/view`, { id }, {}, viewer);
const react = (id: string, viewer: P, kind: string | null) =>
  send(reactRoute, 'POST', `/api/stories/${id}/react`, { id }, { kind }, viewer);
const remove = (id: string, p: P) => send(removeRoute, 'DELETE', `/api/stories/${id}`, { id }, undefined, p);
const flag = (id: string, p: P) =>
  send(reportRoute, 'POST', `/api/reports/story/${id}`, { id }, { reason: 'inappropriate' }, p);
async function seePhoto(id: string, viewer: { cookie?: string } = {}) {
  const res = await photoRoute(request('GET', `/api/stories/${id}/photo`, undefined, viewer), {
    params: Promise.resolve({ id }),
  });
  return res.status;
}
/** Can `viewer` see `owner`'s Stories at all — ring, list and photo agreeing? */
async function sees(viewer: P, owner: P, id: string): Promise<boolean> {
  const inRing = (await ring(viewer)).some((r) => r.person.handle === owner.handle);
  const list = await storiesOf(viewer, owner);
  const photo = await seePhoto(id, as(viewer));
  const all = [inRing, list.status === 200 && list.items.some((s) => s.id === id), photo === 200];
  expect(new Set(all).size, `ring/list/photo disagree for ${viewer.handle}: ${all}`).toBe(1);
  return all[0]!;
}
const expire = (id: string) =>
  q(
    `update stories set created_at = now() - interval '13 hours', expires_at = now() - interval '1 hour' where id = $1`,
    [id],
  );

describe('posting', () => {
  it('a photo with a caption, for 12 hours; I see it as mine with its audience', async () => {
    const a = await person('alice');
    const id = await story(a, { caption: '  chai on the terrace ☕ ' });
    const [row] = (
      await q(`select audience, caption, extract(epoch from expires_at - created_at)::int s from stories`)
    ).rows;
    expect(row).toEqual({ audience: 'pals', caption: 'chai on the terrace ☕', s: 12 * 3600 });
    const mine = await storiesOf(a, a);
    expect(mine.items[0]).toMatchObject({
      id,
      mine: true,
      audience: 'pals',
      caption: 'chai on the terrace ☕',
    });
    expect(await seePhoto(id, as(a))).toBe(200);
    expect((await ring(a))[0]).toMatchObject({ mine: true, unseen: false, count: 1 });
  });

  it('refuses links, long or disguised captions, unknown audiences — and makes no Story', async () => {
    const a = await person('alice');
    const photoId = await photoOf(a);
    for (const bad of [
      { caption: 'see example.com' },
      { caption: 'x'.repeat(81) },
      { caption: 'hi\u202Ethere' },
      { audience: 'everyone' },
      { photoId: 'not-a-uuid' },
    ]) {
      expect((await postRaw(a, { photoId, ...bad })).status, JSON.stringify(bad)).toBe(422);
    }
    expect((await q('select count(*)::int n from stories')).rows[0].n).toBe(0);
  });

  it('only my own fresh, unused photo: someone else’s, a card’s, another Story’s or a stale one is refused', async () => {
    const a = await person('alice');
    const b = await person('bob');
    const count = async () => (await q('select count(*)::int n from stories')).rows[0].n as number;
    const bobs = await photoOf(b);
    expect((await postRaw(a, { photoId: bobs })).status).toBe(422);
    const used = await photoOf(a);
    expect((await postRaw(a, { photoId: used })).status).toBe(201);
    expect((await postRaw(a, { photoId: used })).status).toBe(422);
    // A Story photo cannot go on a card either.
    expect((await nail(a.handle, { body: 'Reuse', photoId: used }, as(a))).status).toBe(422);
    const carded = await photoOf(a);
    expect((await nail(a.handle, { body: 'On my Fence', photoId: carded }, as(a))).status).toBe(201);
    expect((await postRaw(a, { photoId: carded })).status).toBe(422);
    const stale = await photoOf(a);
    await q(`update media set created_at = now() - interval '56 minutes' where id = $1`, [stale]);
    expect((await postRaw(a, { photoId: stale })).status).toBe(422);
    expect(await count()).toBe(1);
  });

  it(`at most ${MAX_LIVE_STORIES} live at once; an expired one does not count`, async () => {
    const a = await person('alice');
    const ids: string[] = [];
    for (let i = 0; i < MAX_LIVE_STORIES; i++) ids.push(await story(a));
    expect((await postRaw(a, { photoId: await photoOf(a) })).status).toBe(409);
    await expire(ids[0]!);
    expect((await postRaw(a, { photoId: await photoOf(a) })).status).toBe(201);
  });

  it('signed out: 401 everywhere', async () => {
    const a = await person('alice');
    const id = await story(a);
    expect(await seePhoto(id)).toBe(401);
    expect((await call(ringRoute, 'GET', '/api/stories')).status).toBe(401);
    expect((await call(postRoute, 'POST', '/api/stories', { photoId: NOPE })).status).toBe(401);
  });
});

describe('who sees it', () => {
  it('all Pals: my Pals do; a stranger, someone I only asked, and a made-up id get the same 404', async () => {
    const [a, pal, stranger, asked] = await Promise.all([
      person('alice'),
      person('pal'),
      person('stranger'),
      person('asked'),
    ]);
    await pals(a, pal);
    await doAct(asked.handle, 'request', as(a));
    const id = await story(a);
    expect(await sees(pal, a, id)).toBe(true);
    expect(await sees(stranger, a, id)).toBe(false);
    expect(await sees(asked, a, id)).toBe(false);
    expect((await storiesOf(stranger, a)).status).toBe(404);
    expect((await storiesOf(pal, { handle: 'nobody_here_xyz' })).status).toBe(404);
    expect(await seePhoto(NOPE, as(pal))).toBe(404);
    expect(await seePhoto('not-a-uuid', as(pal))).toBe(404);
  });

  it('Close Pals only: only Pals I marked Close — their marking me does not count, and unmarking ends it', async () => {
    const [a, close, other] = await Promise.all([person('alice'), person('close'), person('other')]);
    await pals(a, close);
    await pals(a, other);
    await doAct(close.handle, 'close', as(a));
    await doAct(a.handle, 'close', as(other));
    const id = await story(a, { audience: 'close' });
    expect(await sees(close, a, id)).toBe(true);
    expect(await sees(other, a, id)).toBe(false);
    await doAct(close.handle, 'unclose', as(a));
    expect(await sees(close, a, id)).toBe(false);
  });

  it('a viewer never learns the audience or who else sees it', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    await doAct(pal.handle, 'close', as(a));
    await story(a, { audience: 'close' });
    const { items, text } = await storiesOf(pal, a);
    expect(items[0]).toMatchObject({ mine: false, audience: null, viewers: null, reactions: null });
    expect(text).not.toMatch(/"close"|userId|authorId/);
  });

  it('a block either way, my Restrict, their Mute of me, or parting ways hides it; my Mute of them does not', async () => {
    const people = await Promise.all([
      person('alice'),
      person('blocked'),
      person('blocker'),
      person('restricted'),
      person('muter'),
      person('muted'),
      person('parted'),
    ]);
    const [a, blocked, blocker, restricted, muter, muted, parted] = people as [P, P, P, P, P, P, P];
    for (const p of people.slice(1)) await pals(a, p);
    const id = await story(a);
    for (const p of people.slice(1)) expect(await sees(p, a, id), p.handle).toBe(true);
    await doAct(blocked.handle, 'block', as(a));
    await doAct(a.handle, 'block', as(blocker));
    await doAct(restricted.handle, 'restrict', as(a));
    await doAct(a.handle, 'mute', as(muter));
    await doAct(muted.handle, 'mute', as(a));
    await doAct(parted.handle, 'leave', as(a));
    for (const p of [blocked, blocker, restricted, muter, parted])
      expect(await sees(p, a, id), p.handle).toBe(false);
    expect(await sees(muted, a, id)).toBe(true);
  });

  it('a photo the photo check holds: only its owner sees the Story', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    await q(`update media set held = true where story_id = $1`, [id]);
    expect(await sees(pal, a, id)).toBe(false);
    expect(await seePhoto(id, as(a))).toBe(200);
    // The decision itself says no, not only the file read.
    expect(await storyPhotoFor(await userId(pal.handle), id)).toBeNull();
  });

  it('a suspended author’s Stories are not shown', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    await q(`update users set status = 'suspended' where handle = $1`, [a.handle]);
    expect(await sees(pal, a, id)).toBe(false);
  });
});

describe('12 hours, then gone', () => {
  it('past its time it is gone everywhere at once; the daily job deletes it, then its photo file', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    await view(id, pal);
    await react(id, pal, 'fire');
    await expire(id);
    expect(await sees(pal, a, id)).toBe(false);
    expect(await seePhoto(id, as(a))).toBe(404);
    expect((await storiesOf(a, a)).status).toBe(404);
    expect(await purgeExpiredStories()).toEqual({ storiesCleared: 1 });
    for (const t of ['stories', 'story_views', 'story_reactions'])
      expect((await q(`select count(*)::int n from ${t}`)).rows[0].n, t).toBe(0);
    await q(`update media set created_at = now() - interval '2 hours'`);
    expect((await purgeDetachedCardPhotos()).cardPhotosRemoved).toBe(1);
  });

  it('the daily job never takes a live Story or its photo', async () => {
    const a = await person('alice');
    const id = await story(a);
    await q(`update media set created_at = now() - interval '2 hours'`);
    expect(await purgeExpiredStories()).toEqual({ storiesCleared: 0 });
    expect((await purgeDetachedCardPhotos()).cardPhotosRemoved).toBe(0);
    expect(await seePhoto(id, as(a))).toBe(200);
  });

  it('only the author takes it down early; for anyone else it is a 404 and nothing changes', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    expect((await remove(id, pal)).status).toBe(404);
    expect((await remove(NOPE, a)).status).toBe(404);
    expect(await sees(pal, a, id)).toBe(true);
    expect((await remove(id, a)).status).toBe(200);
    expect(await sees(pal, a, id)).toBe(false);
    expect(await seePhoto(id, as(a))).toBe(404);
  });
});

describe('views (reciprocal)', () => {
  it('both share: I see who viewed; a ring turns from new to seen for the viewer', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    expect((await ring(pal)).find((r) => r.person.handle === a.handle)?.unseen).toBe(true);
    expect((await view(id, pal)).status).toBe(200);
    expect((await view(id, pal)).status).toBe(200); // once only
    expect((await ring(pal)).find((r) => r.person.handle === a.handle)?.unseen).toBe(false);
    expect((await storiesOf(a, a)).items[0]!.viewers?.map((v) => v.person.handle)).toEqual([pal.handle]);
    expect((await q('select count(*)::int n from story_views')).rows[0].n).toBe(1);
  });

  it('the viewer keeps views to themselves: not named — and the author is not told why', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    expect((await patchRanch({ storyViews: false }, as(pal))).status).toBe(200);
    await view(id, pal);
    const mine = (await storiesOf(a, a)).items[0]!;
    expect(mine.viewers).toEqual([]);
    // Turning it back on later shows the view (it was a view; the switch only decides who is told).
    await patchRanch({ storyViews: true }, as(pal));
    expect((await storiesOf(a, a)).items[0]!.viewers?.length).toBe(1);
  });

  it('the author keeps views to themselves: they see no viewers at all (reactions still show)', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    await patchRanch({ storyViews: false }, as(a));
    await view(id, pal);
    await react(id, pal, 'love');
    const mine = (await storiesOf(a, a)).items[0]!;
    expect(mine.viewers).toBeNull();
    expect(mine.reactions).toEqual([
      expect.objectContaining({ person: expect.objectContaining({ handle: pal.handle }), reaction: 'love' }),
    ]);
  });

  it('someone I restricted or blocked later is never listed, even for an earlier view or reaction', async () => {
    const [a, r, b] = await Promise.all([person('alice'), person('restr'), person('blk')]);
    await pals(a, r);
    await pals(a, b);
    const id = await story(a);
    for (const p of [r, b]) {
      await view(id, p);
      await react(id, p, 'yo');
    }
    expect((await storiesOf(a, a)).items[0]!.viewers?.length).toBe(2);
    await doAct(r.handle, 'restrict', as(a));
    await doAct(b.handle, 'block', as(a));
    const mine = (await storiesOf(a, a)).items[0]!;
    expect(mine.viewers).toEqual([]);
    expect(mine.reactions).toEqual([]);
  });

  it('a view of a Story I may not see is a 404 and records nothing; my own view is not recorded', async () => {
    const [a, stranger] = await Promise.all([person('alice'), person('stranger')]);
    const id = await story(a);
    expect((await view(id, stranger)).status).toBe(404);
    expect((await view(NOPE, stranger)).status).toBe(404);
    expect((await view(id, a)).status).toBe(200);
    expect((await q('select count(*)::int n from story_views')).rows[0].n).toBe(0);
  });
});

describe('reactions', () => {
  it('a Pal reacts: the author is told once (changing the kind rings nothing) and sees what it was', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    const id = await story(a);
    await markRead({ all: true }, as(a)); // the Pal Chimes from becoming Pals
    expect((await react(id, pal, 'fire')).data).toEqual({ myReaction: 'fire' });
    expect(await bell(as(a))).toBe(1);
    expect((await markRead({ all: true }, as(a))).status).toBe(200);
    expect(await bell(as(a))).toBe(0);
    // Changing the kind must not ring (or re-light the bell) again.
    expect((await react(id, pal, 'laugh')).data).toEqual({ myReaction: 'laugh' });
    expect(await bell(as(a))).toBe(0);
    expect((await types(as(a))).filter((t) => t === 'story_reacted')).toHaveLength(1);
    expect((await storiesOf(pal, a)).items[0]!.myReaction).toBe('laugh');
    expect((await storiesOf(a, a)).items[0]!.reactions?.[0]?.reaction).toBe('laugh');
    expect((await react(id, pal, null)).data).toEqual({ myReaction: null });
    expect((await q('select count(*)::int n from story_reactions')).rows[0].n).toBe(0);
  });

  it('not on my own Story, not on one I cannot see, not an unknown kind', async () => {
    const [a, stranger] = await Promise.all([person('alice'), person('stranger')]);
    const id = await story(a);
    expect((await react(id, a, 'fire')).status).toBe(400);
    expect((await react(id, stranger, 'fire')).status).toBe(404);
    expect((await react(NOPE, stranger, 'fire')).status).toBe(404);
    const [pal] = await Promise.all([person('pal')]);
    await pals(a, pal);
    expect((await react(id, pal, 'cinema')).status).toBe(422);
    expect((await q('select count(*)::int n from story_reactions')).rows[0].n).toBe(0);
    expect(await types(as(a))).not.toContain('story_reacted');
  });
});

describe('flagging', () => {
  it('a viewer flags it; a moderator sees that photo and can take it down — the Story goes with it', async () => {
    const [a, pal, mod, stranger] = await Promise.all([
      person('alice'),
      person('pal'),
      person('mod'),
      person('stranger'),
    ]);
    await makeRole(mod.handle, 'moderator');
    await pals(a, pal);
    const id = await story(a, { caption: 'look at this' });
    expect((await flag(id, stranger)).status).toBe(404);
    expect((await flag(id, a)).status).toBe(404);
    expect((await flag(id, pal)).status).toBe(202);
    const item = (await queue(as(mod))).data.reports![0]!;
    expect(item).toMatchObject({ subject: 'card_photo', evidenceText: 'look at this', canRemove: true });
    const open = async (p: P) =>
      (
        await modPhotoRoute(
          request('GET', `/api/moderation/reports/${item.id}/card-photo`, undefined, as(p)),
          {
            params: Promise.resolve({ id: item.id }),
          },
        )
      ).status;
    expect(await open(mod)).toBe(200);
    expect(await open(pal)).toBe(404);
    expect((await actOnReport(item.id, 'remove_card_photo', as(mod))).status).toBe(200);
    expect(await sees(pal, a, id)).toBe(false);
    expect(await seePhoto(id, as(a))).toBe(404);
  });
});

describe('Download my data', () => {
  it('has my live Stories with their photos and my Story views setting — not expired ones, not others’', async () => {
    const [a, pal] = await Promise.all([person('alice'), person('pal')]);
    await pals(a, pal);
    await story(a, { caption: 'still up' });
    await expire(await story(a, { caption: 'long gone' }));
    await story(pal, { caption: 'not mine' });
    await patchRanch({ storyViews: false }, as(a));
    const { data, entries } = await buildDataExport(await userId(a.handle));
    const mine = data.stories as { caption: string; photo: string }[];
    expect(mine.map((s) => s.caption)).toEqual(['still up']);
    expect(entries.map((e) => e.name)).toContain(mine[0]!.photo);
    expect((data.porch as { settings: { storyViews: boolean } }).settings.storyViews).toBe(false);
  });
});
