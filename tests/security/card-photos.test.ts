import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-photo/route';
import { POST as startPortraitRoute } from '@/app/api/me/portrait/route';
import { GET as photoRoute } from '@/app/api/cards/[id]/photo/route';
import { GET as modPhotoRoute } from '@/app/api/moderation/reports/[id]/card-photo/route';
import { purgeDetachedCardPhotos } from '@/modules/media';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, request, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { fenceOf, flagCard, nail } from '../helpers/fence';
import { freshStore, inspect, jpeg, jpegWithSecrets, sendToStorage } from '../helpers/media';
import { makeRole, queue } from '../helpers/moderation';
import { doAct, q, userId } from '../helpers/social';

/** ADR-031: one photo on a Post Card — who may add one, who may see it, and that it goes with its card. */

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
const cardCount = async () => (await q('select count(*)::int n from post_cards')).rows[0].n as number;

/** Upload a card photo the way the browser does; returns its id once the server has finished it. */
async function photoOf(p: P, bytes?: Buffer): Promise<string> {
  const file = bytes ?? (await jpeg(2400, 1600));
  const start = await call(
    startRoute,
    'POST',
    '/api/me/card-photo',
    { contentType: 'image/jpeg', size: file.length },
    as(p),
  );
  expect(start.status).toBe(201);
  const upload = start.data.upload as { url: string };
  expect((await sendToStorage(upload.url, file, 'image/jpeg')).status).toBe(204);
  const done = await call(finishRoute, 'PUT', '/api/me/card-photo', { mediaId: start.data.mediaId }, as(p));
  expect(done.status).toBe(200);
  return start.data.mediaId as string;
}
async function seePhoto(cardId: string, opts: { cookie?: string; headers?: Record<string, string> } = {}) {
  const res = await photoRoute(request('GET', `/api/cards/${cardId}/photo`, undefined, opts), {
    params: Promise.resolve({ id: cardId }),
  });
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()), etag: res.headers.get('etag') };
}
async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
const openFence = (p: P) =>
  q(
    "update profiles set fence_posting = 'members' where user_id = (select id from users where handle = $1)",
    [p.handle],
  );

describe('adding a photo', () => {
  it('on my own Fence: the card carries it, re-encoded, at most 1280 px, with no hidden data', async () => {
    const me = await person('me');
    const id = await photoOf(me, await jpegWithSecrets());
    const r = await nail(me.handle, { body: 'Look at this', photoId: id }, as(me));
    expect(r.status).toBe(201);
    const photo = r.data.card!.photo as { url: string; width: number; height: number };
    expect(photo.url).toBe(`/api/cards/${r.data.card!.id}/photo?v=${id}`);
    const seen = await seePhoto(r.data.card!.id, as(me));
    expect(seen.status).toBe(200);
    const meta = await inspect(seen.bytes);
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1280);
    expect(meta.exif).toBeUndefined();
    expect(seen.bytes.toString('latin1')).not.toContain('SECRET-COPYRIGHT-NOTE');
  });

  it('never enlarged: a small photo stays its own size', async () => {
    const me = await person('me');
    const id = await photoOf(me, await jpeg(300, 200));
    const r = await nail(me.handle, { body: 'small', photoId: id }, as(me));
    expect(r.data.card!.photo).toMatchObject({ width: 300, height: 200 });
  });

  it("on someone else's Fence only as their Pal; a non-Pal who may post words is refused, and no card is made", async () => {
    const owner = await person('owner');
    const pal = await person('pal');
    const stranger = await person('stranger');
    await openFence(owner);
    await pals(owner, pal);
    expect(
      (await nail(owner.handle, { body: 'from a pal', photoId: await photoOf(pal) }, as(pal))).status,
    ).toBe(201);
    const before = await cardCount();
    const refused = await nail(
      owner.handle,
      { body: 'from a stranger', photoId: await photoOf(stranger) },
      as(stranger),
    );
    expect(refused.status).toBe(403);
    expect(await cardCount()).toBe(before);
    // Words alone are still fine for them.
    expect((await nail(owner.handle, { body: 'just words' }, as(stranger))).status).toBe(201);
    // And the page says who may add one.
    expect((await fenceOf(owner.handle, as(owner))).data.canAddPhoto).toBe(true);
    expect((await fenceOf(owner.handle, as(pal))).data.canAddPhoto).toBe(true);
    expect((await fenceOf(owner.handle, as(stranger))).data.canAddPhoto).toBe(false);
  });

  it("someone else's photo, one already on a card, and one over the hour are refused — and no card is made", async () => {
    const me = await person('me');
    const other = await person('other');
    const theirs = await photoOf(other);
    const used = await photoOf(me);
    expect((await nail(me.handle, { body: 'first', photoId: used }, as(me))).status).toBe(201);
    const old = await photoOf(me);
    await q("update media set created_at = now() - interval '56 minutes' where id = $1", [old]);
    const before = await cardCount();
    for (const photoId of [theirs, used, old, '00000000-0000-4000-8000-000000000000']) {
      const r = await nail(me.handle, { body: 'nope', photoId }, as(me));
      expect(r.status, photoId).toBe(422);
    }
    expect(await cardCount()).toBe(before);
  });

  it('starting a Porch photo upload no longer throws away an unfinished card photo', async () => {
    const me = await person('me');
    const start = await call(
      startRoute,
      'POST',
      '/api/me/card-photo',
      { contentType: 'image/jpeg', size: 2000 },
      as(me),
    );
    await call(
      startPortraitRoute,
      'POST',
      '/api/me/portrait',
      { contentType: 'image/jpeg', size: 2000 },
      as(me),
    );
    expect((await q('select count(*)::int n from media where id = $1', [start.data.mediaId])).rows[0].n).toBe(
      1,
    );
  });
});

describe('who sees the photo: exactly who sees the card', () => {
  it('a hidden Fence, a waiting card, a blocked or suspended writer, and signed-out on a members Fence are all 404', async () => {
    const owner = await person('owner');
    const pal = await person('pal');
    const stranger = await person('stranger');
    await pals(owner, pal);
    const card = (await nail(owner.handle, { body: 'mine', photoId: await photoOf(owner) }, as(owner))).data
      .card!.id;
    expect((await seePhoto(card, as(pal))).status).toBe(200);
    expect((await seePhoto(card, as(stranger))).status).toBe(200); // Fences are members-readable by default
    expect((await seePhoto(card)).status).toBe(404); // signed out, members-only Fence

    await q("update profiles set fence_visibility = 'posse' where user_id = $1", [
      await userId(owner.handle),
    ]);
    expect((await seePhoto(card, as(stranger))).status).toBe(404);
    expect((await seePhoto(card, as(pal))).status).toBe(200);

    await doAct(owner.handle, 'block', as(pal));
    expect((await seePhoto(card, as(pal))).status).toBe(404);
    await q("update users set status = 'suspended' where handle = $1", [owner.handle]);
    expect((await seePhoto(card, as(stranger))).status).toBe(404);
  });

  it("someone I muted, or who is suspended, on a Fence I can read: their card's photo is not shown to me", async () => {
    const owner = await person('owner');
    const writer = await person('writer');
    const viewer = await person('viewer');
    await pals(owner, writer);
    const card = (await nail(owner.handle, { body: 'hi', photoId: await photoOf(writer) }, as(writer))).data
      .card!.id;
    expect((await seePhoto(card, as(viewer))).status).toBe(200);
    await doAct(writer.handle, 'mute', as(viewer));
    expect((await seePhoto(card, as(viewer))).status).toBe(404);
    expect((await seePhoto(card, as(owner))).status).toBe(200);
    await q("update users set status = 'suspended' where handle = $1", [writer.handle]);
    expect((await seePhoto(card, as(owner))).status).toBe(404);
  });

  it('an everyone Fence shows it signed out too', async () => {
    const owner = await person('owner');
    // A Fence is only as open as its Porch: both open to everyone.
    await q(
      "update profiles set fence_visibility = 'everyone', ranch_visibility = 'everyone' where user_id = $1",
      [await userId(owner.handle)],
    );
    const card = (await nail(owner.handle, { body: 'public', photoId: await photoOf(owner) }, as(owner))).data
      .card!.id;
    expect((await seePhoto(card)).status).toBe(200);
  });

  it('a card waiting for approval: only its writer and the Fence owner see the photo', async () => {
    const owner = await person('owner');
    const pal = await person('pal');
    const other = await person('other');
    await pals(owner, pal);
    await q('update profiles set fence_review = true where user_id = $1', [await userId(owner.handle)]);
    const r = await nail(owner.handle, { body: 'waiting', photoId: await photoOf(pal) }, as(pal));
    const card = r.data.card!.id;
    expect((await seePhoto(card, as(pal))).status).toBe(200);
    expect((await seePhoto(card, as(owner))).status).toBe(200);
    expect((await seePhoto(card, as(other))).status).toBe(404);
  });

  it('answers 304 only after re-checking, so losing access stops the photo', async () => {
    const owner = await person('owner');
    const viewer = await person('viewer');
    const card = (await nail(owner.handle, { body: 'x', photoId: await photoOf(owner) }, as(owner))).data
      .card!.id;
    const first = await seePhoto(card, as(viewer));
    expect((await seePhoto(card, { ...as(viewer), headers: { 'if-none-match': first.etag! } })).status).toBe(
      304,
    );
    await doAct(viewer.handle, 'block', as(owner));
    expect((await seePhoto(card, { ...as(viewer), headers: { 'if-none-match': first.etag! } })).status).toBe(
      404,
    );
  });
});

describe('it goes with its card', () => {
  it('removing the card detaches the photo at once (404), and the file is deleted by the clean-up', async () => {
    const me = await person('me');
    const id = await photoOf(me);
    const card = (await nail(me.handle, { body: 'bye', photoId: id }, as(me))).data.card!.id;
    expect(await storage.files()).toHaveLength(1);
    await q('delete from post_cards where id = $1', [card]);
    expect((await seePhoto(card, as(me))).status).toBe(404);
    expect((await q('select card_id from media where id = $1', [id])).rows[0].card_id).toBeNull();
    await q("update media set created_at = now() - interval '2 hours' where id = $1", [id]);
    expect(await purgeDetachedCardPhotos()).toEqual({ cardPhotosRemoved: 1 });
    expect(await storage.files()).toEqual([]);
  });

  it('a photo never nailed goes after an hour; one still in use is never touched', async () => {
    const me = await person('me');
    const unused = await photoOf(me);
    const used = await photoOf(me);
    await nail(me.handle, { body: 'keep', photoId: used }, as(me));
    await q("update media set created_at = now() - interval '2 hours' where id in ($1, $2)", [unused, used]);
    expect(await purgeDetachedCardPhotos()).toEqual({ cardPhotosRemoved: 1 });
    expect((await q('select id from media where id = $1', [used])).rows).toHaveLength(1);
  });
});

describe('moderators see a reported card’s photo', () => {
  it('the queue says it has one and a moderator can open it; nobody else can', async () => {
    const author = await person('author');
    const reporter = await person('reporter');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    const card = (await nail(author.handle, { body: 'bad', photoId: await photoOf(author) }, as(author))).data
      .card!.id;
    expect((await flagCard(card, { reason: 'inappropriate' }, as(reporter))).status).toBe(202);
    const item = (await queue(as(mod))).data.reports![0]!;
    expect(item.cardHasPhoto).toBe(true);
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
    expect(await open(reporter)).toBe(404);
  });
});
