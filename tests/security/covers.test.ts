import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET as getCoverRoute } from '@/app/api/covers/[handle]/route';
import { DELETE as deleteRoute, POST as postRoute, PUT as putRoute } from '@/app/api/me/cover/route';
import { deleteAllMediaFor } from '@/modules/media';
import { getPool } from '@/platform/db';
import { setPhotoChecker } from '@/platform/photo-check';
import { call, freshAuthState, request, signedInUser, uniqueUser, type TestKit } from '../helpers/auth';
import {
  freshStore,
  html,
  inspect,
  jpeg,
  jpegWithSecrets,
  pixelBomb,
  sendToStorage,
  svgWithScript,
  uploadPortrait,
} from '../helpers/media';
import { myRanch, patchRanch, viewRanch } from '../helpers/ranch';
import { doAct, q, userId } from '../helpers/social';

/** ADR-051: a profile's cover photo (and Howdy's own covers). The same pipeline and the same "who may see it" as a Portrait. */

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;
beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
});
afterEach(async () => {
  setPhotoChecker(undefined);
  await storage.cleanup();
});
afterAll(async () => {
  await getPool().end();
});

type Opts = { cookie?: string };
const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (u: { cookie: string }) => ({ cookie: u.cookie });

async function uploadCover(cookie: string, bytes: Buffer, contentType = 'image/jpeg') {
  const start = await call(
    postRoute,
    'POST',
    '/api/me/cover',
    { contentType, size: bytes.length },
    { cookie },
  );
  const upload = start.data.upload as { url: string } | undefined;
  if (start.status !== 201 || !upload) return { start, done: undefined };
  await sendToStorage(upload.url, bytes, contentType);
  const done = await call(putRoute, 'PUT', '/api/me/cover', { mediaId: start.data.mediaId }, { cookie });
  return { start, done };
}
const removeCover = (cookie: string) => call(deleteRoute, 'DELETE', '/api/me/cover', undefined, { cookie });
async function getCover(handle: string, opts: Opts = {}) {
  const res = await getCoverRoute(
    request('GET', `/api/covers/${encodeURIComponent(handle)}`, undefined, opts),
    {
      params: Promise.resolve({ handle }),
    },
  );
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
}
const live = async (kind: string) =>
  (await q("select count(*)::int n from media where kind = $1 and status = 'ready'", [kind])).rows[0]
    .n as number;

describe('a cover photo is decoded, cropped to a banner and re-encoded — only pixels survive', () => {
  it('becomes a 1600x560 WebP with no camera or location data, stored once under covers/', async () => {
    const a = await person('alice');
    const r = await uploadCover(a.cookie, await jpegWithSecrets());
    expect(r.done?.status).toBe(200);
    expect(await storage.files()).toEqual([expect.stringMatching(/^covers\/[0-9a-f-]{36}\.webp$/)]);
    const got = await getCover(a.handle, as(a));
    expect(got.status).toBe(200);
    const meta = await inspect(got.bytes);
    expect(meta).toMatchObject({ format: 'webp', width: 1600, height: 560 });
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('a new cover replaces the old one; the Portrait is a separate photo and stays', async () => {
    const a = await person('alice');
    await uploadPortrait(a.cookie, await jpeg());
    await uploadCover(a.cookie, await jpeg(2000, 900));
    await uploadCover(a.cookie, await jpeg(900, 2000));
    expect(await live('cover')).toBe(1);
    expect(await live('portrait')).toBe(1);
    expect((await storage.files()).filter((f) => f.startsWith('covers/'))).toHaveLength(1);
  });

  it('anything that is not a real photo is refused and nothing is kept', async () => {
    const a = await person('alice');
    for (const [bytes, type] of [
      [svgWithScript(), 'image/png'],
      [html(), 'image/jpeg'],
      [await pixelBomb(), 'image/png'],
    ] as const) {
      const r = await uploadCover(a.cookie, bytes, type);
      expect(r.done?.status).toBe(422);
    }
    expect(await live('cover')).toBe(0);
    expect(await storage.files()).toEqual([]);
  });

  it('a cover the photo check would hold is refused (never held); a held Portrait is still held as before', async () => {
    setPhotoChecker(async () => ({ verdict: 'hold', summary: 'violence 0.6' }));
    const a = await person('alice');
    const cover = await uploadCover(a.cookie, await jpeg());
    expect(cover.done?.status).toBe(422);
    expect(await live('cover')).toBe(0);
    const portrait = await uploadPortrait(a.cookie, await jpeg());
    expect(portrait.done?.status).toBe(200);
    expect((await q("select held from media where kind = 'portrait' and status = 'ready'")).rows).toEqual([
      { held: true },
    ]);
  });
});

describe('who may see a cover photo: exactly who may see the profile photo', () => {
  it('the owner and members of an open profile see it; signed out, a Posse-only profile and a block give the same 404', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await uploadCover(a.cookie, await jpeg());
    expect((await getCover(a.handle, as(a))).status).toBe(200);
    expect((await getCover(a.handle, as(b))).status).toBe(200);
    expect((await getCover(a.handle)).status).toBe(404); // signed out
    await patchRanch({ ranchVisibility: 'posse' }, as(a));
    expect((await getCover(a.handle, as(b))).status).toBe(404);
    await patchRanch({ ranchVisibility: 'members' }, as(a));
    await doAct(b.handle, 'block', as(a));
    expect((await getCover(a.handle, as(b))).status).toBe(404);
    // No cover at all looks exactly the same as a hidden one.
    const c = await person('carol');
    expect((await getCover(c.handle, as(a))).status).toBe(404);
    expect((await getCover('no_such_person', as(a))).status).toBe(404);
  });

  it('removing it takes it away at once (and its file)', async () => {
    const a = await person('alice');
    await uploadCover(a.cookie, await jpeg());
    expect((await removeCover(a.cookie)).data).toEqual({ removed: true });
    expect((await getCover(a.handle, as(a))).status).toBe(404);
    expect(await storage.files()).toEqual([]);
    expect((await removeCover(a.cookie)).data).toEqual({ removed: false });
  });

  it('needs a session to upload or remove (there is no id: only your own)', async () => {
    expect(
      (await call(postRoute, 'POST', '/api/me/cover', { contentType: 'image/jpeg', size: 10 })).status,
    ).toBe(401);
    expect((await call(deleteRoute, 'DELETE', '/api/me/cover')).status).toBe(401);
  });
});

describe("Howdy's own covers", () => {
  it('"porch" by default; one of the six can be chosen; anything else is refused by the app and the database', async () => {
    const a = await person('alice');
    expect((await myRanch(a.cookie)).data.ranch).toMatchObject({ coverPreset: 'porch' });
    expect((await patchRanch({ coverPreset: 'dusk' }, as(a))).status).toBe(200);
    const b = await person('bob');
    expect((await viewRanch(a.handle, as(b))).data.ranch).toMatchObject({ coverPreset: 'dusk' });
    expect((await patchRanch({ coverPreset: 'neon' }, as(a))).status).toBe(422);
    await expect(
      q("update profiles set cover_preset = 'neon' where user_id = $1", [await userId(a.handle)]),
    ).rejects.toThrow(/profiles_cover_preset_check/);
  });
});

describe('deleting', () => {
  it("an account's files go with it, the cover included", async () => {
    const a = await person('alice');
    await uploadCover(a.cookie, await jpeg());
    await deleteAllMediaFor(await userId(a.handle));
    expect(await storage.files()).toEqual([]);
  });

  it('the database allows one live cover per person', async () => {
    const a = await person('alice');
    await uploadCover(a.cookie, await jpeg());
    const id = await userId(a.handle);
    await expect(
      q(
        "insert into media (owner_id, kind, status, object_key) values ($1, 'cover', 'ready', 'covers/second.webp')",
        [id],
      ),
    ).rejects.toThrow(/media_one_ready_per_owner_idx/);
  });
});
