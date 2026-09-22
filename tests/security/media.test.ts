import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteAllMediaFor, purgeStaleMedia } from '@/modules/media';
import { getPool } from '@/platform/db';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import {
  freshStore,
  finishUpload,
  getPortrait,
  gif,
  html,
  inspect,
  jpeg,
  jpegWithSecrets,
  pixelBomb,
  png,
  removeMine,
  sendToStorage,
  startUpload,
  svgWithScript,
  tiff,
  truncatedJpeg,
  uploadPortrait,
  webp,
} from '../helpers/media';
import { patchRanch } from '../helpers/ranch';
import { doAct, q, userId } from '../helpers/social';

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;

beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
});
afterEach(async () => {
  await storage.cleanup();
});
afterAll(async () => {
  await getPool().end();
});

const mediaRows = async () =>
  (
    await q(
      'select id, owner_id, status, object_key, content_type, byte_size, width, height from media order by created_at',
    )
  ).rows;
const as = (u: { cookie: string }) => ({ cookie: u.cookie });

async function alice() {
  return signedInUser(kit, uniqueUser('alice'));
}
async function bob() {
  return signedInUser(kit, uniqueUser('bob'));
}

describe('a new Portrait is decoded, cropped and re-encoded — only pixels survive', () => {
  it('turns a photo into a 512x512 WebP, stores exactly one file, and serves it', async () => {
    const a = await alice();
    const r = await uploadPortrait(a.cookie, await jpeg(1200, 800));
    expect(r.start.status).toBe(201);
    expect(r.sent?.status).toBe(204);
    expect(r.done?.status).toBe(200);

    const rows = await mediaRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ready', content_type: 'image/webp', width: 512, height: 512 });
    // Exactly the processed file is left in storage: the raw upload is gone.
    const files = await storage.files();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^portraits\/[0-9a-f-]{36}\.webp$/);

    const got = await getPortrait(a.handle, as(a));
    expect(got.status).toBe(200);
    expect(got.res.headers.get('content-type')).toBe('image/webp');
    const meta = await inspect(got.bytes);
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
  });

  it('accepts PNG and WebP as well as JPEG', async () => {
    const a = await alice();
    expect((await uploadPortrait(a.cookie, await png(300, 500), 'image/png')).done?.status).toBe(200);
    expect((await uploadPortrait(a.cookie, await webp(700, 300), 'image/webp')).done?.status).toBe(200);
    expect(await storage.files()).toHaveLength(1);
  });

  it('drops the location and camera data hidden in a photo', async () => {
    const a = await alice();
    const original = await jpegWithSecrets();
    expect((await inspect(original)).exif).toBeDefined(); // the test photo really does carry EXIF
    expect((await uploadPortrait(a.cookie, original)).done?.status).toBe(200);
    const got = await getPortrait(a.handle, as(a));
    const meta = await inspect(got.bytes);
    expect(meta.exif).toBeUndefined();
    expect(got.bytes.includes(Buffer.from('SECRET-COPYRIGHT-NOTE'))).toBe(false);
  });

  it('replacing a Portrait leaves one live file and one live row, and removes the old file', async () => {
    const a = await alice();
    const first = await uploadPortrait(a.cookie, await jpeg());
    const v1 = (first.done!.data.portrait as { version: string }).version;
    const second = await uploadPortrait(a.cookie, await png(400, 400), 'image/png');
    const v2 = (second.done!.data.portrait as { version: string }).version;
    expect(v2).not.toBe(v1);
    const rows = await mediaRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'ready' });
    expect(await storage.files()).toEqual([`portraits/${rows[0].object_key.split('/')[1]}`]);
  });

  it('removing it deletes the file and the row, and is harmless to repeat', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    const gone = await removeMine(as(a));
    expect(gone.status).toBe(200);
    expect(gone.data.removed).toBe(true);
    expect(await storage.files()).toEqual([]);
    expect(await mediaRows()).toHaveLength(0);
    expect((await getPortrait(a.handle, as(a))).status).toBe(404);
    expect((await removeMine(as(a))).data.removed).toBe(false);
  });
});

describe('what may be uploaded is decided by the bytes, not by what the browser says', () => {
  it('refuses types we never accept, before any URL is issued', async () => {
    const a = await alice();
    for (const contentType of [
      'image/svg+xml',
      'image/gif',
      'image/tiff',
      'text/html',
      'application/pdf',
      '',
    ]) {
      const r = await startUpload({ contentType, size: 1000 }, as(a));
      expect(r.status, contentType).toBe(422);
    }
    expect(await mediaRows()).toHaveLength(0);
  });

  it('refuses empty, oversized, fractional and malformed sizes', async () => {
    const a = await alice();
    for (const size of [0, -5, 5 * 1024 * 1024 + 1, 1.5, '1000', null, undefined]) {
      const r = await startUpload({ contentType: 'image/jpeg', size }, as(a));
      expect(r.status, String(size)).toBe(422);
    }
    expect((await startUpload({ contentType: 'image/jpeg', size: 5 * 1024 * 1024 }, as(a))).status).toBe(201);
  });

  it.each([
    ['an SVG that runs script', svgWithScript, 'image/png'],
    ['an HTML page', html, 'image/jpeg'],
    ['a GIF', gif, 'image/png'],
    ['a TIFF', tiff, 'image/jpeg'],
    ['plain text', async () => Buffer.from('hello, not a picture'), 'image/webp'],
    ['a truncated JPEG', truncatedJpeg, 'image/jpeg'],
  ])(
    '%s claiming to be a photo is rejected after decoding, and nothing is kept',
    async (_name, make, claimed) => {
      const a = await alice();
      const r = await uploadPortrait(a.cookie, await make(), claimed);
      expect(r.sent?.status).toBe(204); // storage accepts the bytes; the SERVER is what says no
      expect(r.done?.status).toBe(422);
      expect(r.done?.data.error?.fields?.file).toBeTruthy();
      expect(await storage.files()).toEqual([]);
      expect(await mediaRows()).toHaveLength(0);
    },
  );

  it('refuses a "pixel bomb" (small file, enormous picture) without keeping anything', async () => {
    const a = await alice();
    const bomb = await pixelBomb();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024); // it fits the byte limit: only the pixel limit can stop it
    const r = await uploadPortrait(a.cookie, bomb, 'image/png');
    expect(r.done?.status).toBe(422);
    expect(await storage.files()).toEqual([]);
    expect(await mediaRows()).toHaveLength(0);
  });

  it('says the same thing whichever way a photo is unusable (no hints about the decoder)', async () => {
    const a = await alice();
    const messages = new Set<string>();
    for (const [make, claimed] of [
      [svgWithScript, 'image/png'],
      [html, 'image/jpeg'],
      [truncatedJpeg, 'image/jpeg'],
    ] as const) {
      const r = await uploadPortrait(a.cookie, await make(), claimed);
      messages.add(String(r.done?.data.error?.message));
    }
    expect(messages.size).toBe(1);
  });
});

describe('the upload URL grants exactly one thing', () => {
  it('writes nothing unless the size and type match what was signed', async () => {
    const a = await alice();
    const bytes = await jpeg(400, 400);
    const start = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(a));
    const url = (start.data.upload as { url: string }).url;
    expect((await sendToStorage(url, Buffer.concat([bytes, Buffer.from('x')]), 'image/jpeg')).status).toBe(
      400,
    ); // one byte too many
    expect((await sendToStorage(url, bytes.subarray(0, bytes.length - 1), 'image/jpeg')).status).toBe(400); // one byte short
    expect((await sendToStorage(url, bytes, 'image/png')).status).toBe(400); // wrong type
    expect((await sendToStorage(url, bytes, null)).status).toBe(400); // no type
    expect(await storage.files()).toEqual([]);
    expect((await sendToStorage(url, bytes, 'image/jpeg')).status).toBe(204); // the real thing still works
    expect(await storage.files()).toHaveLength(1);
  });

  it('never buffers a body bigger than the limit, whatever the size it declared', async () => {
    const a = await alice();
    const start = await startUpload({ contentType: 'image/jpeg', size: 1000 }, as(a));
    const url = (start.data.upload as { url: string }).url;
    const huge = Buffer.alloc(6 * 1024 * 1024, 1);
    expect((await sendToStorage(url, huge, 'image/jpeg')).status).toBe(400);
    expect(await storage.files()).toEqual([]);
  });

  it('rejects a forged, altered or foreign token, and needs a same-origin request', async () => {
    const a = await alice();
    const bytes = await jpeg(300, 300);
    const start = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(a));
    const url = (start.data.upload as { url: string }).url;
    const token = url.split('/').pop()!;
    const flip = (s: string) => s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
    for (const bad of [flip(token), `${token}x`, token.split('.')[0]!, 'garbage', '', `${token}.${token}`]) {
      const r = await sendToStorage(`/api/media/local/${bad}`, bytes, 'image/jpeg');
      expect(r.status, bad).toBe(400);
    }
    expect((await sendToStorage(url, bytes, 'image/jpeg', { origin: 'https://evil.example' })).status).toBe(
      403,
    );
    expect((await sendToStorage(url, bytes, 'image/jpeg', { origin: null })).status).toBe(403);
    expect(await storage.files()).toEqual([]);
  });

  it('a token for one upload cannot be used to overwrite something else', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg());
    const [aliceFile] = await storage.files();
    const bytes = await jpeg(300, 300);
    const start = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(b));
    await sendToStorage((start.data.upload as { url: string }).url, bytes, 'image/jpeg');
    expect(await storage.files()).toContain(aliceFile);
    expect((await storage.files()).length).toBe(2);
  });
});

describe('only the owner can start, finish or remove their own Portrait', () => {
  it('signed-out callers get 401 everywhere', async () => {
    expect((await startUpload({ contentType: 'image/jpeg', size: 10 })).status).toBe(401);
    expect((await finishUpload('7b0c0a52-6f6a-4d4a-8f0a-0d6f5b8a1c11')).status).toBe(401);
    expect((await removeMine()).status).toBe(401);
  });

  it("someone else's upload id, a made-up one and a finished one all get the same 404", async () => {
    const a = await alice();
    const b = await bob();
    const start = await startUpload({ contentType: 'image/jpeg', size: 10 }, as(a));
    const theirs = start.data.mediaId as string;
    const stolen = await finishUpload(theirs, as(b));
    const madeUp = await finishUpload('7b0c0a52-6f6a-4d4a-8f0a-0d6f5b8a1c11', as(b));
    expect(stolen.status).toBe(404);
    expect(stable(stolen.data)).toBe(stable(madeUp.data));
    // Alice's pending upload was not touched by Bob's attempt.
    expect((await mediaRows()).find((r) => r.id === theirs)?.status).toBe('pending');
    // A finished one is no longer "pending", so it is the same 404 again.
    const done = await uploadPortrait(a.cookie, await jpeg());
    const again = await finishUpload(done.start.data.mediaId, as(a));
    expect(again.status).toBe(404);
  });

  it('bad ids are rejected before anything is looked up', async () => {
    const a = await alice();
    for (const id of ['', 'x', '../../etc/passwd', 123, null, {}]) {
      expect((await finishUpload(id, as(a))).status, JSON.stringify(id)).toBe(422);
    }
  });

  it('a person has at most one unfinished upload: starting another discards the first', async () => {
    const a = await alice();
    const bytes = await jpeg(200, 200);
    const s1 = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(a));
    await sendToStorage((s1.data.upload as { url: string }).url, bytes, 'image/jpeg');
    expect(await storage.files()).toHaveLength(1);
    const s2 = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(a));
    expect(s2.status).toBe(201);
    const rows = await mediaRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(s2.data.mediaId);
    expect(await storage.files()).toEqual([]); // the first raw file went with it
    expect((await finishUpload(s1.data.mediaId, as(a))).status).toBe(404);
  });

  it('an object that is too big for what we accept is refused and deleted even if it reached storage some other way', async () => {
    const a = await alice();
    const start = await startUpload({ contentType: 'image/jpeg', size: 1000 }, as(a));
    const key = (await mediaRows())[0].object_key as string;
    await storage.store.put(key, Buffer.alloc(6 * 1024 * 1024, 1), 'image/jpeg'); // bypasses the upload endpoint's own cap
    const r = await finishUpload(start.data.mediaId, as(a));
    expect(r.status).toBe(422);
    expect(await storage.files()).toEqual([]);
    expect(await mediaRows()).toHaveLength(0);
  });

  it('finishing before anything was sent is an error that leaves nothing behind', async () => {
    const a = await alice();
    const start = await startUpload({ contentType: 'image/jpeg', size: 1000 }, as(a));
    const r = await finishUpload(start.data.mediaId, as(a));
    expect(r.status).toBe(422);
    expect(await mediaRows()).toHaveLength(0);
  });

  it('the database allows one live Portrait per person, and only known states', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    const id = await userId(a.handle);
    await expect(
      q(
        "insert into media (owner_id, kind, status, object_key) values ($1, 'portrait', 'ready', 'portraits/second.webp')",
        [id],
      ),
    ).rejects.toThrow(/media_one_ready_per_owner_idx/);
    await expect(
      q(
        "insert into media (owner_id, kind, status, object_key) values ($1, 'portrait', 'weird', 'portraits/x.webp')",
        [id],
      ),
    ).rejects.toThrow(/media_status_check/);
    await expect(
      q(
        "insert into media (owner_id, kind, status, object_key) values ($1, 'video', 'pending', 'incoming/x')",
        [id],
      ),
    ).rejects.toThrow(/media_kind_check/);
  });

  it('two "finish" requests for the same upload race: one wins, the Portrait survives, nothing leaks', async () => {
    const a = await alice();
    const bytes = await jpeg(900, 900);
    const start = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(a));
    await sendToStorage((start.data.upload as { url: string }).url, bytes, 'image/jpeg');
    const results = await Promise.all([
      finishUpload(start.data.mediaId, as(a)),
      finishUpload(start.data.mediaId, as(a)),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([404, 409]).toContain(statuses[1]);
    const rows = await mediaRows();
    expect(rows.filter((r) => r.status === 'ready')).toHaveLength(1);
    expect(rows.filter((r) => r.status !== 'ready')).toHaveLength(0);
    expect(await storage.files()).toHaveLength(1);
    expect((await getPortrait(a.handle, as(a))).status).toBe(200); // the winner's photo is still there
  });
});

describe('cost limits', () => {
  it('starting uploads is limited per person, and one person cannot use up another’s allowance', async () => {
    const a = await alice();
    const b = await bob();
    for (let i = 0; i < 10; i++)
      expect((await startUpload({ contentType: 'image/jpeg', size: 10 }, as(a))).status).toBe(201);
    const blocked = await startUpload({ contentType: 'image/jpeg', size: 10 }, as(a));
    expect(blocked.status).toBe(429);
    expect(await mediaRows()).toHaveLength(1); // the refused request created nothing
    expect((await startUpload({ contentType: 'image/jpeg', size: 10 }, as(b))).status).toBe(201);
  });

  it('finishing is limited too, and the limit is spent before the id is even looked up', async () => {
    const a = await alice();
    const fake = '7b0c0a52-6f6a-4d4a-8f0a-0d6f5b8a1c11';
    for (let i = 0; i < 20; i++) expect((await finishUpload(fake, as(a))).status).toBe(404);
    expect((await finishUpload(fake, as(a))).status).toBe(429);
  });
});

describe('who may see a Portrait: the same people who may open the Ranch, and nobody else', () => {
  it('signed-out visitors get nothing', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    expect((await getPortrait(a.handle)).status).toBe(404);
  });

  it('you always see your own; other members see it while the Ranch is open to members', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg());
    expect((await getPortrait(a.handle, as(a))).status).toBe(200);
    expect((await getPortrait(a.handle, as(b))).status).toBe(200);
  });

  it('a Posse-only Ranch hides the photo from everyone else until they join the Posse', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg());
    await patchRanch({ ranchVisibility: 'posse' }, as(a));
    expect((await getPortrait(a.handle, as(b))).status).toBe(404);
    await doAct(a.handle, 'request', as(b));
    expect((await getPortrait(a.handle, as(b))).status).toBe(404); // asking is not belonging
    await doAct(b.handle, 'accept', as(a));
    expect((await getPortrait(a.handle, as(b))).status).toBe(200);
  });

  it('blocking someone takes the photo away at once, even from a browser that has it cached', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg());
    const first = await getPortrait(a.handle, as(b));
    const etag = first.res.headers.get('etag')!;
    expect(etag).toBeTruthy();
    expect((await getPortrait(a.handle, { ...as(b), headers: { 'if-none-match': etag } })).status).toBe(304);
    await doAct(b.handle, 'block', as(a));
    expect((await getPortrait(a.handle, { ...as(b), headers: { 'if-none-match': etag } })).status).toBe(404);
    expect((await getPortrait(a.handle, as(b))).status).toBe(404);
  });

  it('a missing person, a hidden Ranch, a suspended account, a blocked visitor and "no photo" are indistinguishable', async () => {
    const a = await alice();
    const b = await bob();
    const c = await signedInUser(kit, uniqueUser('carol'));
    await uploadPortrait(a.cookie, await jpeg());
    await uploadPortrait(c.cookie, await jpeg());
    await patchRanch({ ranchVisibility: 'posse' }, as(a)); // hidden from Bob
    await q("update users set status = 'suspended' where handle = $1", [c.handle]); // suspended
    const d = await signedInUser(kit, uniqueUser('dana')); // never uploaded anything
    const answers = [
      await getPortrait('nobody_by_this_name', as(b)),
      await getPortrait(a.handle, as(b)),
      await getPortrait(c.handle, as(b)),
      await getPortrait(d.handle, as(b)),
      await getPortrait('bad handle!!', as(b)),
    ];
    for (const r of answers) expect(r.status).toBe(404);
    expect(new Set(answers.map((r) => stable(JSON.parse(r.text)))).size).toBe(1);
  });

  it('is never cached without being re-checked, and cannot be sniffed into anything else', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    const { res } = await getPortrait(a.handle, as(a));
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-type')).toBe('image/webp');
  });

  it('looking at photos is rate limited per person, spent before any handle is looked up', async () => {
    const b = await bob();
    for (let i = 0; i < 600; i++) {
      const r = await getPortrait('nobody_by_this_name', as(b));
      if (r.status === 429) throw new Error(`limited too early (${i})`);
    }
    expect((await getPortrait('nobody_by_this_name', as(b))).status).toBe(429);
  });
});

describe('the local upload endpoint only exists for the local driver', () => {
  it('answers 404 when the configured store is not the local one', async () => {
    const a = await alice();
    const start = await startUpload({ contentType: 'image/jpeg', size: 10 }, as(a));
    const url = (start.data.upload as { url: string }).url;
    const { setObjectStore } = await import('@/platform/storage');
    setObjectStore({
      createUpload: async () => ({ url: 'https://bucket.example/x', method: 'PUT', headers: {} }),
      size: async () => null,
      get: async () => null,
      put: async () => undefined,
      delete: async () => undefined,
    });
    expect((await sendToStorage(url, Buffer.alloc(10), 'image/jpeg')).status).toBe(404);
  });
});

describe('deleting is thorough, and clean-up problems never break the person’s request', () => {
  it('a storage error while removing an old photo does not fail the upload, and the retention job finishes the job', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    const store = storage.store;
    const realDelete = store.delete.bind(store);
    store.delete = async () => {
      throw new Error('storage is having a moment');
    };
    const second = await uploadPortrait(a.cookie, await png(300, 300), 'image/png');
    expect(second.done?.status).toBe(200); // the new photo is live
    const rows = await mediaRows();
    expect(rows.filter((r) => r.status === 'ready')).toHaveLength(1);
    const leftovers = rows.filter((r) => r.status === 'retired');
    expect(leftovers.length).toBeGreaterThanOrEqual(2); // the old photo AND the raw upload are both remembered
    expect((await storage.files()).length).toBe(1 + leftovers.length); // ...and their files are still there

    store.delete = realDelete;
    const purged = await purgeStaleMedia();
    expect(purged.mediaRetired).toBe(leftovers.length);
    expect(await storage.files()).toHaveLength(1);
    expect((await mediaRows()).every((r) => r.status === 'ready')).toBe(true);
    expect((await getPortrait(a.handle, as(a))).status).toBe(200);
  });

  it('the retention job removes abandoned uploads but not fresh ones or live photos', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg()); // live
    const bytes = await jpeg(200, 200);
    const stale = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(b));
    await sendToStorage((stale.data.upload as { url: string }).url, bytes, 'image/jpeg');
    await q("update media set created_at = now() - interval '2 hours' where id = $1", [stale.data.mediaId]);
    const c = await signedInUser(kit, uniqueUser('carol'));
    const fresh = await startUpload({ contentType: 'image/jpeg', size: bytes.length }, as(c));
    await sendToStorage((fresh.data.upload as { url: string }).url, bytes, 'image/jpeg');

    const purged = await purgeStaleMedia();
    expect(purged.mediaPending).toBe(1);
    const ids = (await mediaRows()).map((r) => r.id);
    expect(ids).not.toContain(stale.data.mediaId);
    expect(ids).toContain(fresh.data.mediaId);
    expect((await storage.files()).length).toBe(2); // Alice's photo + Carol's fresh upload
    expect((await getPortrait(a.handle, as(a))).status).toBe(200);
    expect(await purgeStaleMedia()).toEqual({ mediaPending: 0, mediaRetired: 0 }); // safe to repeat
  });

  it('deleting a person’s files removes the objects first and then the rows', async () => {
    const a = await alice();
    const b = await bob();
    await uploadPortrait(a.cookie, await jpeg());
    await uploadPortrait(b.cookie, await jpeg());
    const id = await userId(a.handle);
    expect(await deleteAllMediaFor(id)).toBe(1);
    expect(await storage.files()).toHaveLength(1); // only Bob's is left
    expect((await mediaRows()).map((r) => r.owner_id)).toEqual([await userId(b.handle)]);
  });

  it('deleting the account row removes the media rows with it (the files are removed by deleteAllMediaFor first)', async () => {
    const a = await alice();
    await uploadPortrait(a.cookie, await jpeg());
    await q('delete from users where handle = $1', [a.handle]);
    expect(await mediaRows()).toHaveLength(0);
  });
});
