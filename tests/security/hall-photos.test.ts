import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-photo/route';
import { GET as photoRoute } from '@/app/api/hall-posts/[id]/photo/route';
import { GET as modPhotoRoute } from '@/app/api/moderation/reports/[id]/card-photo/route';
import { AUTO_HOLD_REPORTERS } from '@/modules/moderation/anti-spam';
import { purgeDetachedCardPhotos } from '@/modules/media';
import { hallPostPhotoFor } from '@/modules/town-halls';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, request, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { nail } from '../helpers/fence';
import { feed, held, post, removePost, reportPost } from '../helpers/hall-feed';
import { freshStore, jpeg, sendToStorage } from '../helpers/media';
import { makeRole, queue } from '../helpers/moderation';
import { doAct, q, report } from '../helpers/social';
import { act, ban, create, invite } from '../helpers/town-halls';

/** ADR-046: one photo on a Town Hall post — who may add one, who may see it, and that it goes with its post. */

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

/** Upload a photo the way the browser does; returns its id once the server has finished it. */
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

async function seePhoto(postId: string, viewer: { cookie?: string } = {}) {
  const res = await photoRoute(request('GET', `/api/hall-posts/${postId}/photo`, undefined, viewer), {
    params: Promise.resolve({ id: postId }),
  });
  return res.status;
}

/** A Town Hall with an owner and the given members. */
async function hall(owner: P, members: P[] = [], visibility = 'open'): Promise<string> {
  const r = await create(
    { name: 'Porch Talk', description: 'Chatting on the porch.', visibility },
    as(owner),
  );
  const id = r.data.townHall!.id as string;
  for (const m of members) {
    if (visibility === 'invite') {
      await invite(id, m.handle, as(owner));
      await act(id, 'accept', as(m));
    } else expect((await act(id, 'join', as(m))).status).toBe(200);
  }
  return id;
}

async function postWithPhoto(id: string, p: P, body = 'Sunset from the porch') {
  const photoId = await photoOf(p);
  const r = await post(id, { body, photoId }, as(p));
  expect(r.status).toBe(201);
  return (r.data as { post: { id: string; photo: { url: string } | null } }).post;
}

describe('posting a photo', () => {
  it('a member posts one photo with their words; every member sees it in the feed', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await postWithPhoto(id, ann);
    expect(made.photo?.url).toBe(`/api/hall-posts/${made.id}/photo?v=${made.photo!.url.split('v=')[1]}`);
    const seen = (await feed(id, as(owner))).data.posts as unknown as { id: string; photo: unknown }[];
    expect(seen.find((p) => p.id === made.id)?.photo).not.toBeNull();
    expect(await seePhoto(made.id, as(owner))).toBe(200);
    expect(await seePhoto(made.id, as(ann))).toBe(200);
  });

  it('only my own finished photo, once: someone else’s, a used one or a card’s is refused and no post is made', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const annPhoto = await photoOf(ann);
    const count = async () => (await q('select count(*)::int n from town_hall_posts')).rows[0].n as number;
    expect((await post(id, { body: 'Not mine', photoId: annPhoto }, as(owner))).status).toBe(422);
    expect((await post(id, { body: 'Mine', photoId: annPhoto }, as(ann))).status).toBe(201);
    expect((await post(id, { body: 'Again', photoId: annPhoto }, as(ann))).status).toBe(422);
    // A photo already nailed to a Post Card cannot also go in a Town Hall — and the other way round.
    const cardPhoto = await photoOf(ann);
    expect((await nail(ann.handle, { body: 'On my Fence', photoId: cardPhoto }, as(ann))).status).toBe(201);
    expect((await post(id, { body: 'Card photo', photoId: cardPhoto }, as(ann))).status).toBe(422);
    const hallPhoto = (await postWithPhoto(id, ann, 'Hall first')).photo!.url.split('v=')[1]!;
    expect((await nail(ann.handle, { body: 'Reuse', photoId: hallPhoto }, as(ann))).status).toBe(422);
    expect(await count()).toBe(2);
  });

  it('a photo older than the attach window is refused', async () => {
    const owner = await person('owner');
    const photoId = await photoOf(owner);
    const id = await hall(owner);
    await q(`update media set created_at = now() - interval '56 minutes' where id = $1`, [photoId]);
    expect((await post(id, { body: 'Late', photoId }, as(owner))).status).toBe(422);
  });
});

describe('who sees it', () => {
  it('members only: outsiders, people who left and banned people get the same 404', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const stranger = await person('stranger');
    const id = await hall(owner, [ann, bob]);
    const made = await postWithPhoto(id, owner);
    expect(await seePhoto(made.id, as(stranger))).toBe(404);
    expect(await seePhoto(made.id, {})).toBe(401);
    await act(id, 'leave', as(ann));
    expect(await seePhoto(made.id, as(ann))).toBe(404);
    await ban(id, bob.handle, as(owner));
    expect(await seePhoto(made.id, as(bob))).toBe(404);
    expect(await seePhoto('00000000-0000-4000-8000-000000000000', as(owner))).toBe(404);
  });

  it('not from someone I blocked, and not on a post with no photo', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await postWithPhoto(id, ann);
    const plain = (await post(id, { body: 'Just words' }, as(owner))).data as { post: { id: string } };
    expect(await seePhoto(plain.post.id, as(ann))).toBe(404);
    await doAct(ann.handle, 'block', as(owner));
    expect(await seePhoto(made.id, as(owner))).toBe(404);
  });

  it('a photo the photo check is holding: only its owner sees it', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await postWithPhoto(id, ann);
    await q(`update media set held = true where hall_post_id = $1`, [made.id]);
    expect(await seePhoto(made.id, as(ann))).toBe(200);
    expect(await seePhoto(made.id, as(owner))).toBe(404);
    // The decision itself says no (the file read refuses it too, but each guard must hold on its own).
    const ownerId = (await q('select id from users where handle = $1', [owner.handle])).rows[0].id as string;
    expect(await hallPostPhotoFor(ownerId, made.id)).toBeNull();
    const seen = (await feed(id, as(owner))).data.posts as unknown as { id: string; photo: unknown }[];
    expect(seen.find((p) => p.id === made.id)?.photo).toBeNull();
  });

  it('a held post: its writer and the staff see the photo (in the held tray), other members nothing', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const bob = await person('bob');
    const id = await hall(owner, [ann, bob]);
    for (let i = 0; i < AUTO_HOLD_REPORTERS; i++)
      await report({ handle: ann.handle, reason: 'spam' }, as(await person(`rep${i}`)));
    const made = await postWithPhoto(id, ann);
    expect(await seePhoto(made.id, as(ann))).toBe(200);
    expect(await seePhoto(made.id, as(owner))).toBe(200);
    expect(await seePhoto(made.id, as(bob))).toBe(404);
    const tray = (await held(id, as(owner))).data.posts as unknown as { id: string; photo: unknown }[];
    expect(tray.find((p) => p.id === made.id)?.photo).not.toBeNull();
  });
});

describe('it goes with its post', () => {
  it('taking the post down stops the photo at once, and the clean-up deletes the file', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const id = await hall(owner, [ann]);
    const made = await postWithPhoto(id, ann);
    expect((await removePost(made.id, as(owner))).status).toBe(200);
    expect(await seePhoto(made.id, as(ann))).toBe(404);
    await q(
      `update media set created_at = now() - interval '2 hours' where owner_id = (select id from users where handle = $1)`,
      [ann.handle],
    );
    expect((await purgeDetachedCardPhotos()).cardPhotosRemoved).toBe(1);
  });

  it('the clean-up never takes a photo that is on a live post', async () => {
    const owner = await person('owner');
    const id = await hall(owner);
    const made = await postWithPhoto(id, owner);
    await q(`update media set created_at = now() - interval '2 hours'`);
    expect((await purgeDetachedCardPhotos()).cardPhotosRemoved).toBe(0);
    expect(await seePhoto(made.id, as(owner))).toBe(200);
  });
});

describe('moderators', () => {
  it('see the photo on a reported Town Hall post; nobody else can open it that way', async () => {
    const owner = await person('owner');
    const ann = await person('ann');
    const mod = await person('mod');
    await makeRole(mod.handle, 'moderator');
    const id = await hall(owner, [ann]);
    const made = await postWithPhoto(id, ann);
    expect((await reportPost(made.id, { reason: 'inappropriate' }, as(owner))).status).toBe(202);
    const item = (await queue(as(mod))).data.reports![0]!;
    expect(item.subject).toBe('hall_post');
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
    expect(await open(owner)).toBe(404);
  });
});
