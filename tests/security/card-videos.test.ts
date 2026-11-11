import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as photoStartRoute, PUT as photoFinishRoute } from '@/app/api/me/card-photo/route';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-video/route';
import { GET as videoRoute } from '@/app/api/cards/[id]/video/route';
import { GET as posterRoute } from '@/app/api/cards/[id]/video/poster/route';
import { GET as localGetRoute } from '@/app/api/media/local/[token]/route';
import { GET as modVideoRoute } from '@/app/api/moderation/reports/[id]/card-video/route';
import { expireCardVideos, purgeDetachedCardPhotos } from '@/modules/media';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import {
  call,
  freshAuthState,
  ORIGIN,
  request,
  settledUser,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { fenceOf, flagCard, nail, scrape } from '../helpers/fence';
import { freshStore, inspect, jpeg, sendToStorage } from '../helpers/media';
import { actOnReport, makeRole, queue } from '../helpers/moderation';
import { fakeMp4, type FakeMp4 } from '../helpers/mp4';
import { listFriendsFeed } from '@/modules/fence';
import { doAct, q, userId } from '../helpers/social';

/** ADR-064: 30-second videos on posts — for the writer's friends, checked headers, short-lived links, gone after 3 days. */

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
const friendsOnly = (p: P) =>
  q(
    "update profiles set fence_visibility = 'posse' where user_id = (select id from users where handle = $1)",
    [p.handle],
  );
const everyMember = (p: P) =>
  q(
    "update profiles set fence_visibility = 'members' where user_id = (select id from users where handle = $1)",
    [p.handle],
  );
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
const videoFiles = async () => (await storage.files()).filter((f) => f.startsWith('videos/'));

/** The poster, sent the way the page does: as a card photo. */
async function posterOf(p: P): Promise<string> {
  const file = await jpeg(1280, 720);
  const start = await call(
    photoStartRoute,
    'POST',
    '/api/me/card-photo',
    { contentType: 'image/jpeg', size: file.length },
    as(p),
  );
  await sendToStorage((start.data.upload as { url: string }).url, file, 'image/jpeg');
  const done = await call(
    photoFinishRoute,
    'PUT',
    '/api/me/card-photo',
    { mediaId: start.data.mediaId },
    as(p),
  );
  expect(done.status).toBe(200);
  return start.data.mediaId as string;
}

/** The whole browser path after the phone has converted the clip: poster, ask, send, finish. */
async function upload(p: P, mp4: Buffer = fakeMp4(), poster?: string) {
  const posterId = poster ?? (await posterOf(p));
  const start = await call(
    startRoute,
    'POST',
    '/api/me/card-video',
    { contentType: 'video/mp4', size: mp4.length },
    as(p),
  );
  if (start.status !== 201) return { start, done: undefined, id: undefined };
  const sent = await sendToStorage((start.data.upload as { url: string }).url, mp4, 'video/mp4');
  expect(sent.status).toBe(204);
  const done = await call(
    finishRoute,
    'PUT',
    '/api/me/card-video',
    { mediaId: start.data.mediaId, posterId },
    as(p),
  );
  return { start, done, id: start.data.mediaId as string };
}
async function videoOf(p: P, o?: FakeMp4): Promise<string> {
  const r = await upload(p, fakeMp4(o));
  expect(r.done?.status).toBe(200);
  return r.id!;
}

async function watch(cardId: string, opts: { cookie?: string } = {}) {
  const res = await videoRoute(request('GET', `/api/cards/${cardId}/video`, undefined, opts), {
    params: Promise.resolve({ id: cardId }),
  });
  return {
    status: res.status,
    location: res.headers.get('location'),
    cache: res.headers.get('cache-control'),
  };
}
async function poster(cardId: string, opts: { cookie?: string } = {}) {
  const res = await posterRoute(request('GET', `/api/cards/${cardId}/video/poster`, undefined, opts), {
    params: Promise.resolve({ id: cardId }),
  });
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
}
/** What the `<video>` does with the link: GET it, here with a range (the local stand-in for the bucket). */
async function stream(location: string, range?: string) {
  const token = location.split('/').pop()!;
  const res = await localGetRoute(new Request(`${ORIGIN}${location}`, { headers: range ? { range } : {} }), {
    params: Promise.resolve({ token }),
  });
  return {
    status: res.status,
    bytes: Buffer.from(await res.arrayBuffer()),
    type: res.headers.get('content-type'),
    range: res.headers.get('content-range'),
  };
}

describe('posting a video on a friends-only wall', () => {
  it('posts, plays through a 10-minute link with range requests, and shows its poster', async () => {
    const me = await person('me');
    await friendsOnly(me);
    expect((await fenceOf(me.handle, as(me))).data.canAddVideo).toBe(true);
    const mp4 = fakeMp4({ seconds: 12.5 });
    const { id, done } = await upload(me, mp4);
    expect(done!.data.video).toMatchObject({ width: 1280, height: 720, durationMs: 12500 });

    const r = await nail(me.handle, { body: 'Watch this', videoId: id }, as(me));
    expect(r.status).toBe(201);
    const card = r.data.card!;
    expect(card.video).toMatchObject({ state: 'ready', durationMs: 12500, width: 1280, height: 720 });
    expect(card.photo).toBeNull();

    const w = await watch(card.id, as(me));
    expect(w.status).toBe(302);
    expect(w.cache).toContain('no-store');
    const whole = await stream(w.location!);
    expect(whole.status).toBe(200);
    expect(whole.type).toBe('video/mp4');
    expect(whole.bytes.equals(mp4)).toBe(true);
    const part = await stream(w.location!, 'bytes=0-99');
    expect(part.status).toBe(206);
    expect(part.bytes).toHaveLength(100);
    expect(part.range).toBe(`bytes 0-99/${mp4.length}`);

    const p = await poster(card.id, as(me));
    expect(p.status).toBe(200);
    expect((await inspect(p.bytes)).format).toBe('webp');
  });

  it('a video alone is a whole post, and its words can later be taken away', async () => {
    const me = await person('me');
    await friendsOnly(me);
    expect((await nail(me.handle, { videoId: await videoOf(me) }, as(me))).status).toBe(201);
  });

  it('a photo and a video together are refused', async () => {
    const me = await person('me');
    await friendsOnly(me);
    const r = await nail(
      me.handle,
      { body: 'both', videoId: await videoOf(me), photoId: await posterOf(me) },
      as(me),
    );
    expect(r.status).toBe(422);
  });

  it("on a friend's friends-only wall as their friend; never as a stranger", async () => {
    const owner = await person('owner');
    const pal = await person('pal');
    await friendsOnly(owner);
    await q(
      "update profiles set fence_posting = 'posse' where user_id = (select id from users where handle = $1)",
      [owner.handle],
    );
    await pals(owner, pal);
    expect((await fenceOf(owner.handle, as(pal))).data.canAddVideo).toBe(true);
    expect((await nail(owner.handle, { body: 'hi', videoId: await videoOf(pal) }, as(pal))).status).toBe(201);
  });
});

describe("videos are for the writer's friends, on any wall and on Home", () => {
  it('on a wall every member can read: posted; a friend watches (also on Home); a stranger reads only the words', async () => {
    const me = await person('me');
    const pal = await person('pal');
    const stranger = await person('stranger');
    await everyMember(me);
    await pals(me, pal);
    expect((await fenceOf(me.handle, as(me))).data.canAddVideo).toBe(true);
    const r = await nail(me.handle, { body: 'for friends', videoId: await videoOf(me) }, as(me));
    expect(r.status).toBe(201);
    const card = r.data.card!;
    expect(card.video).toMatchObject({ state: 'ready' });

    const palSees = (await fenceOf(me.handle, as(pal))).data.cards!.find((c) => c.id === card.id)!;
    expect(palSees.video).toMatchObject({ state: 'ready' });
    expect((await watch(card.id, as(pal))).status).toBe(302);
    const home = await listFriendsFeed(await userId(pal.handle), { rateKey: pal.handle });
    expect(home.cards.find((c) => c.id === card.id)?.video).toMatchObject({ state: 'ready' });

    const strangerSees = (await fenceOf(me.handle, as(stranger))).data.cards!.find((c) => c.id === card.id)!;
    expect(strangerSees.body).toBe('for friends');
    expect(strangerSees.video).toEqual({ state: 'friends' });
    expect(JSON.stringify(strangerSees)).not.toContain('/video');
    expect((await watch(card.id, as(stranger))).status).toBe(404);
    expect((await poster(card.id, as(stranger))).status).toBe(404);
    expect((await watch(card.id)).status).toBe(401);
  });

  it("on someone else's wall, the owner's other friends see words only unless they are the writer's friends", async () => {
    const owner = await person('owner');
    const writer = await person('writer');
    const ownersPal = await person('ownerspal');
    await pals(owner, writer);
    await pals(owner, ownersPal);
    const card = (await nail(owner.handle, { body: 'hi', videoId: await videoOf(writer) }, as(writer))).data
      .card!;
    const seen = (await fenceOf(owner.handle, as(ownersPal))).data.cards!.find((c) => c.id === card.id)!;
    expect(seen.video).toEqual({ state: 'friends' });
    expect((await watch(card.id, as(ownersPal))).status).toBe(404);
    expect((await watch(card.id, as(owner))).status).toBe(302);
  });

  it('a friend can watch; a stranger and a signed-out visitor cannot', async () => {
    const me = await person('me');
    const pal = await person('pal');
    const stranger = await person('stranger');
    await friendsOnly(me);
    await pals(me, pal);
    const card = (await nail(me.handle, { body: 'v', videoId: await videoOf(me) }, as(me))).data.card!;
    expect((await watch(card.id, as(pal))).status).toBe(302);
    expect((await watch(card.id, as(stranger))).status).toBe(404);
    expect((await poster(card.id, as(stranger))).status).toBe(404);
    expect((await watch(card.id)).status).toBe(401);
  });

  it('someone who stops being a friend stops seeing and getting the video', async () => {
    const me = await person('me');
    const pal = await person('pal');
    await everyMember(me);
    await pals(me, pal);
    const card = (await nail(me.handle, { body: 'v', videoId: await videoOf(me) }, as(me))).data.card!;
    expect((await watch(card.id, as(pal))).status).toBe(302);
    expect((await doAct(me.handle, 'leave', as(pal))).status).toBeLessThan(300);
    expect((await watch(card.id, as(pal))).status).toBe(404);
    const seen = (await fenceOf(me.handle, as(pal))).data.cards!.find((c) => c.id === card.id)!;
    expect(seen.video).toEqual({ state: 'friends' });
  });
});

describe('the server checks what arrived, whatever the page claims', () => {
  it.each([
    ['HEVC (what iPhones record)', { codec: 'hvc1' }, 'not prepared properly'],
    ['index at the end (no fast start)', { fastStart: false }, 'not prepared properly'],
    ['over 30 seconds', { seconds: 45 }, 'at most 30 seconds'],
    ['1080p (skipped the phone step)', { width: 1920, height: 1080 }, 'not shrunk properly'],
  ] as const)('%s is refused and its file deleted', async (_, o, message) => {
    const me = await person('me');
    const r = await upload(me, fakeMp4(o));
    expect(r.done!.status).toBe(422);
    expect(r.done!.data.error?.fields?.file ?? '').toContain(message);
    expect(await videoFiles()).toEqual([]);
  });

  it('something that is not a video at all', async () => {
    const me = await person('me');
    const r = await upload(me, Buffer.from('<!doctype html><script>alert(1)</script>'));
    expect(r.done!.status).toBe(422);
    expect(await videoFiles()).toEqual([]);
  });

  it('only video/mp4 up to 20 MB gets an upload link', async () => {
    const me = await person('me');
    for (const body of [
      { contentType: 'video/quicktime', size: 1000 },
      { contentType: 'video/mp4', size: 21 * 1024 * 1024 },
      { contentType: 'video/mp4', size: 0 },
    ]) {
      expect((await call(startRoute, 'POST', '/api/me/card-video', body, as(me))).status).toBe(422);
    }
  });

  it("someone else's poster is refused", async () => {
    const me = await person('me');
    const other = await person('other');
    const r = await upload(me, fakeMp4(), await posterOf(other));
    expect(r.done!.status).toBe(422);
  });

  it('three posted videos a day; the fourth is refused, at upload and at posting', async () => {
    const me = await person('me');
    // Uploaded but never posted (e.g. the post failed): not one of the three.
    for (let i = 0; i < 3; i++) await videoOf(me);
    for (let i = 0; i < 3; i++)
      expect((await nail(me.handle, { body: `v${i}`, videoId: await videoOf(me) }, as(me))).status).toBe(201);
    const fourth = await upload(me);
    expect(fourth.done!.status).toBe(422);
    expect(fourth.done!.data.error?.message).toContain('3 videos a day');
  });

  it('finished uploads saved up earlier cannot all be posted past the three', async () => {
    const me = await person('me');
    const saved = [];
    for (let i = 0; i < 4; i++) saved.push(await videoOf(me));
    for (let i = 0; i < 3; i++)
      expect((await nail(me.handle, { body: `v${i}`, videoId: saved[i] }, as(me))).status).toBe(201);
    const r = await nail(me.handle, { body: 'v3', videoId: saved[3] }, as(me));
    expect(r.status).toBe(422);
    expect(r.data.error?.message).toContain('3 videos a day');
  });
});

describe('gone after 3 days', () => {
  it('stops playing at the exact moment, then the job deletes both files and the post says it expired', async () => {
    const me = await person('me');
    await friendsOnly(me);
    const id = await videoOf(me);
    const card = (await nail(me.handle, { body: 'soon gone', videoId: id }, as(me))).data.card!;
    expect((await videoFiles()).length).toBe(1);

    await q("update media set expires_at = now() - interval '1 minute' where id = $1", [id]);
    expect((await watch(card.id, as(me))).status).toBe(404);
    expect((await poster(card.id, as(me))).status).toBe(404);
    let seen = (await fenceOf(me.handle, as(me))).data.cards!.find((c) => c.id === card.id)!;
    expect(seen.video).toEqual({ state: 'expired' });

    const before = await storage.files();
    expect(await expireCardVideos()).toEqual({ videosExpired: 1 });
    expect(await videoFiles()).toEqual([]);
    // The poster file went too.
    expect((await storage.files()).length).toBe(before.length - 2);
    seen = (await fenceOf(me.handle, as(me))).data.cards!.find((c) => c.id === card.id)!;
    expect(seen.video).toEqual({ state: 'expired' });
    // Running again changes nothing.
    expect(await expireCardVideos()).toEqual({ videosExpired: 0 });
  });

  it('taking the post down lets the clean-up remove the video row and files', async () => {
    const me = await person('me');
    await friendsOnly(me);
    const id = await videoOf(me);
    const card = (await nail(me.handle, { body: 'bye', videoId: id }, as(me))).data.card!;
    expect((await scrape(card.id, as(me))).status).toBe(200);
    await q("update media set created_at = now() - interval '2 hours' where id = $1", [id]);
    expect((await purgeDetachedCardPhotos()).cardPhotosRemoved).toBe(1);
    expect(await videoFiles()).toEqual([]);
    expect((await q('select id from media where id = $1', [id])).rows).toHaveLength(0);
  });

  it('a video never posted within the hour is thrown away', async () => {
    const me = await person('me');
    const id = await videoOf(me);
    await q("update media set created_at = now() - interval '2 hours' where id = $1", [id]);
    await purgeDetachedCardPhotos();
    expect(await videoFiles()).toEqual([]);
  });
});

describe('a report hides the video until a moderator decides', () => {
  it('hidden from others at once (not from its writer); a moderator can play it; dismissing shows it again', async () => {
    const author = await person('author');
    const pal = await person('pal');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    await friendsOnly(author);
    await pals(author, pal);
    const card = (await nail(author.handle, { body: 'look', videoId: await videoOf(author) }, as(author)))
      .data.card!;
    expect((await watch(card.id, as(pal))).status).toBe(302);

    expect((await flagCard(card.id, { reason: 'inappropriate' }, as(pal))).status).toBe(202);
    expect((await watch(card.id, as(pal))).status).toBe(404);
    expect((await watch(card.id, as(author))).status).toBe(302);

    const item = (await queue(as(mod))).data.reports![0]!;
    expect(item.cardHasVideo).toBe(true);
    expect(item.cardHasPhoto).toBe(false);
    const open = async (p: P) =>
      (
        await modVideoRoute(
          request('GET', `/api/moderation/reports/${item.id}/card-video`, undefined, as(p)),
          {
            params: Promise.resolve({ id: item.id }),
          },
        )
      ).status;
    expect(await open(mod)).toBe(302);
    expect(await open(pal)).toBe(404);

    expect((await actOnReport(item.id, { action: 'dismiss' }, as(mod))).status).toBe(200);
    expect((await watch(card.id, as(pal))).status).toBe(302);
  });
});
