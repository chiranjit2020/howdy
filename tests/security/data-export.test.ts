import { crc32 } from 'node:zlib';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as sealRoute } from '@/app/api/capsules/route';
import { POST as exportRoute } from '@/app/api/me/export/route';
import { readPortrait } from '@/modules/media';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { MemoryRateLimiter, setRateLimiter } from '@/platform/rate-limit';
import { addDays, dayOf } from '@/shared/calendar';
import {
  auditEvents,
  call,
  freshAuthState,
  request,
  settledUser,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { nail } from '../helpers/fence';
import { giveMarkTo } from '../helpers/marks';
import { freshStore, jpeg, uploadPortrait } from '../helpers/media';
import { doAct, q, userId } from '../helpers/social';
import { leaveTribute } from '../helpers/tributes';
import { whisper } from '../helpers/whispers';

/**
 * ADR-037: "Download my data". Password again, limited, a real ZIP — and nothing in it that the app would not show the
 * person right now (a block, a suspension, a held card or Whisper, a declined request, a sealed capsule, who gave a Mark).
 */

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

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });

/** Read a stored-entry ZIP into name → bytes, checking every CRC and that both directories agree. */
function unzip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(-1);
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(at)).toBe(0x02014b50);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const bytes = buf.subarray(start, start + size);
    expect(crc32(bytes)).toBe(crc);
    out.set(name, bytes);
    at += 46 + nameLen;
  }
  return out;
}

async function exportOf(p: P, password = p.password) {
  const res = await exportRoute(request('POST', '/api/me/export', { password }, as(p)));
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status !== 200) return { status: res.status, res, error: JSON.parse(buf.toString('utf8')) };
  const files = unzip(buf);
  const text = files.get('data.json')!.toString('utf8');
  return { status: 200, res, files, text, data: JSON.parse(text) };
}
/** A successful export's data.json, as text and parsed. */
async function dataOf(p: P) {
  const r = await exportOf(p);
  expect(r.status).toBe(200);
  return { text: r.text!, data: r.data! };
}

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}

describe('asking for my data', () => {
  it('needs a session and my password; a wrong one gives no file', async () => {
    const a = await person('alice');
    const signedOut = await call(exportRoute, 'POST', '/api/me/export', { password: a.password });
    expect(signedOut.status).toBe(401);
    const wrong = await exportOf(a, 'not my password at all');
    expect(wrong.status).toBe(400);
    expect(wrong.error.error.fields.password).toBeDefined();
    expect(wrong.res.headers.get('content-type')).not.toContain('zip');
  });

  it('is a ZIP named after me, never cached, with a README and data.json; recorded in the security log', async () => {
    const a = await person('alice');
    const r = await exportOf(a);
    expect(r.status).toBe(200);
    expect(r.res.headers.get('content-type')).toBe('application/zip');
    expect(r.res.headers.get('content-disposition')).toMatch(
      new RegExp(`^attachment; filename="howdy-${a.handle}-\\d{4}-\\d{2}-\\d{2}\\.zip"$`),
    );
    expect(r.res.headers.get('cache-control')).toBe('no-store');
    expect([...r.files!.keys()]).toEqual(['README.txt', 'data.json']);
    expect(r.data.account.callSign).toBe(a.handle);
    expect(r.data.account.email).toBe(a.email);
    expect(r.data.account.agreements.length).toBeGreaterThan(0);
    expect(r.data.account.signedInDevices.length).toBeGreaterThan(0);
    expect(await auditEvents(await userId(a.handle))).toContain('data_exported');
  });

  it('is limited: three a day, and wrong passwords run out before the right one helps', async () => {
    const a = await person('alice');
    for (let i = 0; i < 3; i++) expect((await exportOf(a)).status).toBe(200);
    expect((await exportOf(a)).status).toBe(429);

    const b = await person('bob');
    for (let i = 0; i < 10; i++) expect((await exportOf(b, 'guess number ' + i)).status).toBe(400);
    expect((await exportOf(b)).status).toBe(429);
  });

  it('carries my Portrait, byte for byte', async () => {
    const a = await person('alice');
    expect((await uploadPortrait(a.cookie, await jpeg(400, 400))).done?.status).toBe(200);
    const r = await exportOf(a);
    const stored = await readPortrait(await userId(a.handle), 'moderator');
    expect(r.files!.get('photos/portrait.webp')?.equals(stored!.bytes)).toBe(true);
    expect(r.data.porch.portrait).toBe('photos/portrait.webp');
  });
});

describe('what is in it: exactly what the app shows me', () => {
  it('my words and my settings; other people only by call sign and name — never their email or id', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    expect((await nail(a.handle, { body: 'Mine on my Fence' }, as(a))).status).toBe(201);
    expect((await nail(a.handle, { body: 'From Bob' }, as(b))).status).toBe(201);
    expect((await nail(b.handle, { body: 'Alice was here' }, as(a))).status).toBe(201);
    await whisper(b.handle, 'psst', as(a));
    await flushBackground();

    const { text, data } = await dataOf(a);
    expect(data.fence.onMyFence.map((c: { words: string }) => c.words).sort()).toEqual([
      'From Bob',
      'Mine on my Fence',
    ]);
    expect(data.fence.cardsINailedElsewhere).toMatchObject([
      { words: 'Alice was here', state: 'posted', onTheFenceOf: { callSign: b.handle } },
    ]);
    expect(data.pals.pals).toMatchObject([{ callSign: b.handle }]);
    expect(data.whispers.threads).toMatchObject([
      { with: { callSign: b.handle }, whispers: [{ from: 'me', words: 'psst' }] },
    ]);
    expect(text).not.toContain(b.email);
    expect(text).not.toContain(await userId(b.handle));
    expect(text).not.toContain(await userId(a.handle));
  });

  it('a card held because the owner restricted me looks posted to me — and waits for the owner', async () => {
    const owner = await person('owner');
    const writer = await person('writer');
    await pals(owner, writer);
    await doAct(writer.handle, 'restrict', as(owner));
    expect((await nail(owner.handle, { body: 'held for the owner' }, as(writer))).status).toBe(201);
    const [{ status }] = (await q(`select status from post_cards where body = 'held for the owner'`)).rows;
    expect(status).toBe('held');

    const mine = (await dataOf(writer)).data.fence.cardsINailedElsewhere;
    expect(mine).toMatchObject([{ words: 'held for the owner', state: 'posted' }]);
    const owners = (await dataOf(owner)).data.fence.onMyFence;
    expect(owners).toMatchObject([{ words: 'held for the owner', state: 'waiting for approval' }]);
    // and the restriction itself is in the owner's file, never the writer's
    expect((await dataOf(owner)).data.pals.restricted).toMatchObject([{ callSign: writer.handle }]);
    expect((await dataOf(writer)).data.pals.restricted).toEqual([]);
  });

  it('a declined request still looks sent to whoever asked', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await doAct(b.handle, 'request', as(a));
    await doAct(a.handle, 'decline', as(b));
    const { data } = await dataOf(a);
    expect(data.pals.requestsISent).toMatchObject([{ callSign: b.handle }]);
    expect(data.pals.pals).toEqual([]);
  });

  it('someone who blocked me is not in my file at all — not my card on their Fence, not my Mark, not my Tribute', async () => {
    const me = await person('me');
    const them = await person('them');
    await pals(me, them);
    expect((await nail(them.handle, { body: 'on their Fence' }, as(me))).status).toBe(201);
    expect((await giveMarkTo(them.handle, 'gem', as(me))).status).toBeLessThan(300);
    expect((await leaveTribute(them.handle, { body: 'a kind word' }, as(me))).status).toBeLessThan(300);
    await whisper(them.handle, 'hello', as(me));
    await flushBackground();
    expect((await dataOf(me)).text).toContain(them.handle); // present before the block

    await doAct(me.handle, 'block', as(them));
    const { text } = await dataOf(me);
    expect(text).not.toContain(them.handle);
    expect(text).not.toContain('on their Fence');
    expect(text).not.toContain('a kind word');
    // and the person who blocked sees their own block list
    expect((await dataOf(them)).data.pals.blocked).toMatchObject([{ callSign: me.handle }]);
  });

  it('a suspended or closing account disappears from my file, as everywhere else', async () => {
    const me = await person('me');
    const gone = await person('gone');
    await pals(me, gone);
    expect((await nail(me.handle, { body: 'from the soon-gone' }, as(gone))).status).toBe(201);
    expect((await dataOf(me)).text).toContain('from the soon-gone');
    for (const status of ['suspended', 'pending_deletion']) {
      await q(`update users set status = $2 where handle = $1`, [gone.handle, status]);
      const { text } = await dataOf(me);
      expect(text).not.toContain(gone.handle);
      expect(text).not.toContain('from the soon-gone');
      await q(`update users set status = 'active' where handle = $1`, [gone.handle]);
      setRateLimiter(new MemoryRateLimiter()); // fresh export limits for the next round
    }
  });

  it('a Whisper held back from me is in my held tray, not my thread; the sender sees it as sent', async () => {
    const me = await person('me');
    const them = await person('them');
    await pals(me, them);
    await doAct(them.handle, 'restrict', as(me));
    await whisper(me.handle, 'held words', as(them));
    await flushBackground();

    const mine = (await dataOf(me)).data.whispers;
    expect(
      mine.threads.flatMap((t: { whispers: { words: string }[] }) => t.whispers.map((w) => w.words)),
    ).not.toContain('held words');
    expect(mine.heldBackFromMe).toMatchObject([{ words: 'held words', from: { callSign: them.handle } }]);
    const theirs = (await dataOf(them)).data.whispers;
    expect(theirs.threads).toMatchObject([{ whispers: [{ from: 'me', words: 'held words' }] }]);
    expect(theirs.heldBackFromMe).toEqual([]);
  });

  it('sealed capsule words are in nobody’s file — not even the writer’s', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    const openOn = addDays(dayOf(new Date()), 30);
    for (const to of ['me', b.handle]) {
      const r = await call(
        sealRoute,
        'POST',
        '/api/capsules',
        { to, body: `secret for ${to}`, openOn },
        as(a),
      );
      expect(r.status).toBe(201);
    }
    const mine = await dataOf(a);
    expect(mine.text).not.toContain('secret for');
    expect(mine.data.timeCapsules.iSealed).toHaveLength(2);
    const theirs = await dataOf(b);
    expect(theirs.text).not.toContain('secret for');
    expect(theirs.data.timeCapsules.comingToMe).toMatchObject([
      { from: { callSign: a.handle }, opensOn: openOn },
    ]);
  });

  it('Marks I received are counts only — never who gave them', async () => {
    const a = await person('alice');
    const b = await person('bob');
    await pals(a, b);
    expect((await giveMarkTo(a.handle, 'chill', as(b))).status).toBeLessThan(300);
    const { data } = await dataOf(a);
    expect(data.marks.receivedCounts).toEqual({ chill: 1 });
    // Bob is my Pal, so he is in my Pals list — but nothing ties him to the Mark.
    expect(JSON.stringify(data.marks)).not.toContain(b.handle);
    expect((await dataOf(b)).data.marks.iGave).toMatchObject([{ to: { callSign: a.handle }, mark: 'chill' }]);
  });
});
