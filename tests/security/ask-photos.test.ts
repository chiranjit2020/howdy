import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-photo/route';
import { GET as photoRoute } from '@/app/api/asks/[id]/photo/route';
import { purgeDetachedCardPhotos } from '@/modules/media';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { askPublic, listAsks, removeAsk, type PublicAsk } from '../helpers/asks';
import { call, freshAuthState, request, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { freshStore, jpeg, sendToStorage } from '../helpers/media';
import { doAct, q } from '../helpers/social';

/** ADR-066: one photo on a public "Buy or wait?" — only the asker's own, seen by exactly who may see the question. */

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

async function photoOf(p: P): Promise<string> {
  const file = await jpeg(1600, 1200);
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

async function seePhoto(askId: string, viewer: { cookie?: string } = {}) {
  const res = await photoRoute(request('GET', `/api/asks/${askId}/photo`, undefined, viewer), {
    params: Promise.resolve({ id: askId }),
  });
  return res.status;
}

const Q = { item: 'Air fryer', price: 6499, why: 'I cook every evening and want fewer oily dishes.' };
async function askWith(p: P, audience: 'friends' | 'everyone', photoId?: string) {
  const r = await askPublic({ ...Q, audience, ...(photoId ? { photoId } : {}) }, as(p));
  return r;
}

describe('a photo on a public question', () => {
  it('"everyone": anyone sees it, signed out too; it is on the question for all', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const r = await askWith(ann, 'everyone', await photoOf(ann));
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const a = r.data.ask as PublicAsk & { photo: { url: string } | null };
    expect(a.photo?.url).toMatch(new RegExp(`^/api/asks/${a.id}/photo\\?v=`));
    expect(await seePhoto(a.id, as(ann))).toBe(200);
    expect(await seePhoto(a.id, as(bob))).toBe(200);
    expect(await seePhoto(a.id)).toBe(200);
    const seen = (await listAsks(as(bob))).data.asks!.find((x) => x.id === a.id) as typeof a;
    expect(seen.photo).not.toBeNull();
  });

  it('"friends": friends only; strangers, signed-out visitors and anyone blocked get 404', async () => {
    const ann = await person('ann');
    const friend = await person('friend');
    const stranger = await person('stranger');
    await doAct(friend.handle, 'request', as(ann));
    await doAct(ann.handle, 'accept', as(friend));
    const a = (await askWith(ann, 'friends', await photoOf(ann))).data.ask!;
    expect(await seePhoto(a.id, as(friend))).toBe(200);
    expect(await seePhoto(a.id, as(stranger))).toBe(404);
    expect(await seePhoto(a.id)).toBe(404);
    await doAct(friend.handle, 'block', as(ann));
    expect(await seePhoto(a.id, as(friend))).toBe(404);
  });

  it('only my own fresh photo: someone else’s, or one already on a question, is refused', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const bobs = await photoOf(bob);
    const stolen = await askWith(ann, 'everyone', bobs);
    expect(stolen.status).toBe(422);
    expect(stolen.data.error?.fields?.photo).toBeTruthy();
    // Nothing was asked: the failed photo leaves no question behind.
    expect((await listAsks(as(ann), '?show=mine')).data.asks).toEqual([]);
    const mine = await photoOf(ann);
    expect((await askWith(ann, 'everyone', mine)).status).toBe(201);
    expect((await askWith(ann, 'everyone', mine)).status).toBe(422);
  });

  it('a photo the photo check held is shown to its asker only', async () => {
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await photoOf(ann);
    await q('update media set held = true where id = $1', [id]);
    const a = (await askWith(ann, 'everyone', id)).data.ask!;
    expect(await seePhoto(a.id, as(ann))).toBe(200);
    expect(await seePhoto(a.id, as(bob))).toBe(404);
    expect(await seePhoto(a.id)).toBe(404);
  });

  it('goes with its question: taken down, the photo stops and its file is cleaned up', async () => {
    const ann = await person('ann');
    const id = await photoOf(ann);
    const a = (await askWith(ann, 'everyone', id)).data.ask!;
    // Attached, it survives the hourly clean-up even when old.
    await q("update media set created_at = now() - interval '2 hours' where id = $1", [id]);
    await purgeDetachedCardPhotos();
    expect(await seePhoto(a.id)).toBe(200);
    expect((await removeAsk(a.id, as(ann))).status).toBe(200);
    expect(await seePhoto(a.id)).toBe(404);
    await purgeDetachedCardPhotos();
    const left = await q('select count(*)::int as n from media where id = $1', [id]);
    expect(left.rows[0].n).toBe(0);
  });
});
