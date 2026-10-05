import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as startRoute, PUT as finishRoute } from '@/app/api/me/card-photo/route';
import { GET as photoRoute } from '@/app/api/cards/[id]/photo/route';
import { GET as modCardPhotoRoute } from '@/app/api/moderation/reports/[id]/card-photo/route';
import { GET as modPortraitRoute } from '@/app/api/moderation/reports/[id]/portrait/route';
import { POST as reportPortraitRoute } from '@/app/api/reports/portrait/[handle]/route';
import { getPortraitVersions, readCardPhoto, readPortrait } from '@/modules/media';
import { isUnderReview } from '@/modules/moderation';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { setPhotoChecker, verdictFor, type PhotoVerdict } from '@/platform/photo-check';
import { setRateLimiter } from '@/platform/rate-limit';
import { call, freshAuthState, request, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { fenceOf, nail } from '../helpers/fence';
import { freshStore, getPortrait, jpeg, sendToStorage, uploadPortrait } from '../helpers/media';
import { actOnReport, makeRole, queue, type QueueItem } from '../helpers/moderation';
import { doAct, q, userId } from '../helpers/social';

/** ADR-039: the photo check on Portraits and Post Card photos — refuse, hold for a moderator, or let through. */

let kit: TestKit;
let storage: Awaited<ReturnType<typeof freshStore>>;
/** What the fake check answers next, and every picture it was shown. */
let answer: PhotoVerdict = { verdict: 'ok' };
let shown: Buffer[] = [];
beforeEach(async () => {
  kit = await freshAuthState();
  storage = await freshStore();
  setRateLimiter({ consume: async () => ({ allowed: true, remaining: 999, retryAfterSec: 0 }) });
  answer = { verdict: 'ok' };
  shown = [];
  setPhotoChecker(async (jpg) => {
    shown.push(jpg);
    return answer;
  });
});
afterEach(async () => {
  setPhotoChecker(undefined);
  await storage.cleanup();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const HOLD: PhotoVerdict = { verdict: 'hold', summary: 'Photo check: violence 0.62' };
const REFUSE: PhotoVerdict = { verdict: 'refuse', summary: 'Photo check: sexual 0.97' };

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
async function moderator() {
  const m = await person('mod');
  await makeRole(m.handle, 'moderator');
  return m;
}
const reportsCount = async () => (await q('select count(*)::int n from reports')).rows[0].n as number;
const openItems = async (mod: P) => {
  await flushBackground();
  return ((await queue(as(mod))).data.reports ?? []) as (QueueItem & { automatic: boolean })[];
};

async function cardPhoto(p: P) {
  const file = await jpeg(1600, 1200);
  const start = await call(
    startRoute,
    'POST',
    '/api/me/card-photo',
    { contentType: 'image/jpeg', size: file.length },
    as(p),
  );
  expect(start.status).toBe(201);
  await sendToStorage((start.data.upload as { url: string }).url, file, 'image/jpeg');
  const done = await call(finishRoute, 'PUT', '/api/me/card-photo', { mediaId: start.data.mediaId }, as(p));
  return { mediaId: start.data.mediaId as string, done };
}
async function seeCardPhoto(cardId: string, p?: P) {
  const res = await photoRoute(request('GET', `/api/cards/${cardId}/photo`, undefined, p ? as(p) : {}), {
    params: Promise.resolve({ id: cardId }),
  });
  return res.status;
}

describe('what the check is shown', () => {
  it('only our own re-encoded pixels, as a small JPEG', async () => {
    const me = await person('me');
    expect((await uploadPortrait(me.cookie, await jpeg(3000, 2000))).done?.status).toBe(200);
    expect(shown).toHaveLength(1);
    const meta = await sharp(shown[0]!).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(512);
    expect(meta.exif).toBeUndefined();
  });

  it('without a key there is no check, and photos go up as before', async () => {
    setPhotoChecker(null);
    const [a, b] = [await person('alice'), await person('bob')];
    await pals(a, b);
    expect((await uploadPortrait(a.cookie, await jpeg(400, 400))).done?.status).toBe(200);
    expect((await getPortrait(a.handle, as(b))).status).toBe(200);
    expect(shown).toHaveLength(0);
  });
});

describe('refused outright', () => {
  it('a Portrait is turned down, nothing is kept, and nobody is told', async () => {
    const me = await person('me');
    answer = REFUSE;
    const r = await uploadPortrait(me.cookie, await jpeg(400, 400));
    expect(r.done?.status).toBe(422);
    expect(JSON.stringify(r.done?.data)).toContain('use that photo');
    expect((await getPortrait(me.handle, as(me))).status).toBe(404);
    expect((await q("select count(*)::int n from media where status <> 'retired'")).rows[0].n).toBe(0);
    await flushBackground();
    expect(await reportsCount()).toBe(0);
  });

  it('a card photo too', async () => {
    const me = await person('me');
    answer = REFUSE;
    expect((await cardPhoto(me)).done.status).toBe(422);
  });

  it('an earlier Portrait stays when its replacement is refused', async () => {
    const [a, b] = [await person('alice'), await person('bob')];
    await pals(a, b);
    await uploadPortrait(a.cookie, await jpeg(400, 400));
    answer = REFUSE;
    await uploadPortrait(a.cookie, await jpeg(500, 500));
    expect((await getPortrait(a.handle, as(b))).status).toBe(200);
  });
});

describe('held for a moderator', () => {
  it('a held Portrait: its owner sees it, nobody else does, and it cannot be reported by someone who cannot see it', async () => {
    const [a, b] = [await person('alice'), await person('bob')];
    await pals(a, b);
    answer = HOLD;
    expect((await uploadPortrait(a.cookie, await jpeg(400, 400))).done?.status).toBe(200);
    expect((await getPortrait(a.handle, as(a))).status).toBe(200);
    expect((await getPortrait(a.handle, as(b))).status).toBe(404);
    const report = await call(
      (req: Request) => reportPortraitRoute(req, { params: Promise.resolve({ handle: a.handle }) }),
      'POST',
      `/api/reports/portrait/${a.handle}`,
      { reason: 'inappropriate' },
      as(b),
    );
    expect(report.status).toBe(404);
    // Pals lists leave the photo out too (initials show).
    const rel = await call(
      (await import('@/app/api/me/relationships/route')).GET,
      'GET',
      '/api/me/relationships',
      undefined,
      as(b),
    );
    expect(JSON.stringify(rel.data)).not.toContain('/api/portraits/');
  });

  it('goes to the queue as an automatic report, with no reporter and not counting towards auto-hold', async () => {
    const a = await person('alice');
    const mod = await moderator();
    answer = HOLD;
    await uploadPortrait(a.cookie, await jpeg(400, 400));
    const [item] = await openItems(mod);
    expect(item).toMatchObject({
      automatic: true,
      subject: 'portrait',
      reason: 'inappropriate',
      reporter: null,
      canRemove: true,
      details: HOLD.verdict === 'hold' ? HOLD.summary : '',
    });
    expect(item!.target?.handle).toBe(a.handle);
    const modSees = await modPortraitRoute(
      request('GET', `/api/moderation/reports/${item!.id}/portrait`, undefined, as(mod)),
      { params: Promise.resolve({ id: item!.id }) },
    );
    expect(modSees.status).toBe(200);
    // Many held photos still do not hold the person's writing (auto-hold counts reporters).
    for (let i = 0; i < 4; i++) await uploadPortrait(a.cookie, await jpeg(300 + i, 300));
    await flushBackground();
    expect(await isUnderReview(await userId(a.handle))).toBe(false);
  });

  it('Dismiss shows it to everyone again; Remove takes it down', async () => {
    const [a, b, c] = [await person('alice'), await person('bob'), await person('carol')];
    await pals(a, b);
    await pals(c, b);
    const mod = await moderator();
    answer = HOLD;
    await uploadPortrait(a.cookie, await jpeg(400, 400));
    await uploadPortrait(c.cookie, await jpeg(400, 400));
    const items = await openItems(mod);
    const of = (p: P) => items.find((i) => i.target?.handle === p.handle)!;
    expect((await actOnReport(of(a).id, 'dismiss', as(mod))).status).toBe(200);
    expect((await getPortrait(a.handle, as(b))).status).toBe(200);
    expect((await actOnReport(of(c).id, 'remove_portrait', as(mod))).status).toBe(200);
    expect((await getPortrait(c.handle, as(c))).status).toBe(404);
  });

  it('a held card photo: the card shows without it to others, with it to its writer; Remove keeps the card', async () => {
    const [a, b] = [await person('alice'), await person('bob')];
    await pals(a, b);
    const mod = await moderator();
    answer = HOLD;
    const { mediaId, done } = await cardPhoto(a);
    expect(done.status).toBe(200);
    const nailed = await nail(a.handle, { body: 'look', photoId: mediaId }, as(a));
    expect(nailed.status).toBe(201);
    const cardId = nailed.data.card!.id as string;
    const cardFor = async (p: P) =>
      (await fenceOf(a.handle, as(p))).data.cards!.find((c: { id: string }) => c.id === cardId)!;
    expect((await cardFor(a)).photo).not.toBeNull();
    expect((await cardFor(b)).photo).toBeNull();
    expect(await seeCardPhoto(cardId, a)).toBe(200);
    expect(await seeCardPhoto(cardId, b)).toBe(404);

    const [item] = await openItems(mod);
    expect(item).toMatchObject({ automatic: true, subject: 'card_photo', canRemove: true });
    const modSees = await modCardPhotoRoute(
      request('GET', `/api/moderation/reports/${item!.id}/card-photo`, undefined, as(mod)),
      { params: Promise.resolve({ id: item!.id }) },
    );
    expect(modSees.status).toBe(200);
    expect((await actOnReport(item!.id, 'remove_card_photo', as(mod))).status).toBe(200);
    expect(await seeCardPhoto(cardId, a)).toBe(404);
    expect((await cardFor(a)).body).toBe('look');
  });

  it('the media module itself never hands a held photo to anyone but its owner or a moderator', async () => {
    const [a, b] = [await person('alice'), await person('bob')];
    answer = HOLD;
    const { mediaId } = await cardPhoto(a);
    await uploadPortrait(a.cookie, await jpeg(400, 400));
    const id = await userId(a.handle);
    expect(await readCardPhoto(mediaId, { userId: null })).toBeNull();
    expect(await readCardPhoto(mediaId, { userId: await userId(b.handle) })).toBeNull();
    expect(await readCardPhoto(mediaId, { userId: id })).not.toBeNull();
    expect(await readCardPhoto(mediaId, 'moderator')).not.toBeNull();
    expect(await readPortrait(id, { userId: null })).toBeNull();
    expect(await getPortraitVersions([id], { userId: null })).toEqual(new Map());
    expect(await readPortrait(id, 'moderator')).not.toBeNull();
  });

  it('a dismissed card photo shows to others', async () => {
    const [a, b] = [await person('alice'), await person('bob')];
    await pals(a, b);
    const mod = await moderator();
    answer = HOLD;
    const { mediaId } = await cardPhoto(a);
    const cardId = (await nail(a.handle, { body: 'x', photoId: mediaId }, as(a))).data.card!.id as string;
    const [item] = await openItems(mod);
    await actOnReport(item!.id, 'dismiss', as(mod));
    expect(await seeCardPhoto(cardId, b)).toBe(200);
  });
});

describe('the verdict rules', () => {
  const scores = (s: Record<string, number>, flagged = true) => ({ flagged, category_scores: s });
  it('refuses only near-certain sexual content or graphic violence', () => {
    expect(verdictFor(scores({ sexual: 0.95 })).verdict).toBe('refuse');
    expect(verdictFor(scores({ 'violence/graphic': 0.91 })).verdict).toBe('refuse');
    expect(verdictFor(scores({ sexual: 0.7 })).verdict).toBe('hold');
    expect(verdictFor(scores({ violence: 0.99 })).verdict).toBe('hold');
    expect(verdictFor(scores({ 'self-harm': 0.95 })).verdict).toBe('hold');
    expect(verdictFor(scores({ sexual: 0.2 }, false)).verdict).toBe('ok');
  });
  it('the summary names the strongest image categories, never anything else', () => {
    const v = verdictFor(scores({ violence: 0.62, sexual: 0.05, harassment: 0.9 }));
    expect(v).toEqual({ verdict: 'hold', summary: 'Photo check: violence 0.62, sexual 0.05' });
  });
});
