import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as heldRoute } from '@/app/api/whispers/held/route';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import { call, freshAuthState, settledUser, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, q } from '../helpers/social';
import { threadOf, whisper } from '../helpers/whispers';

/** ADR-026: the held tray — Whispers kept back from me because I restricted their sender. */

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
interface Held {
  id: string;
  body: string;
  from: { handle: string };
}
const tray = async (p?: P) => {
  const r = await call(heldRoute, 'GET', '/api/whispers/held', undefined, p ? as(p) : {});
  return { status: r.status, held: (r.data.held ?? []) as Held[] };
};

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
/** `me` has restricted `them`; `them` then whispers `me`. */
async function restrictedThread() {
  const me = await person('me');
  const them = await person('them');
  await pals(me, them);
  await whisper(me.handle, 'before restricting', as(them));
  await doAct(them.handle, 'restrict', as(me));
  const r = await whisper(me.handle, 'held words', as(them));
  expect(r.status).toBeLessThan(300);
  await flushBackground();
  return { me, them };
}

describe('the held tray', () => {
  it('shows me the Whispers held back from me, with who sent them; nothing that reached me normally', async () => {
    const { me, them } = await restrictedThread();
    const t = await tray(me);
    expect(t.status).toBe(200);
    expect(t.held.map((h) => [h.body, h.from.handle])).toEqual([['held words', them.handle]]);
    // and they are still not in the thread itself
    const bodies = (await threadOf(them.handle, as(me))).data.messages?.map((m) => m.body) ?? [];
    expect(bodies).toContain('before restricting');
    expect(bodies).not.toContain('held words');
  });

  it('is mine alone: the sender and anyone else see nothing of it', async () => {
    const { me, them } = await restrictedThread();
    const outsider = await person('outsider');
    expect((await tray(them)).held).toEqual([]);
    expect((await tray(outsider)).held).toEqual([]);
    expect((await tray()).status).toBe(401);
    expect((await tray(me)).held).toHaveLength(1);
  });

  it('reading it tells the sender nothing: no read position, no Seen, no Chime', async () => {
    const { me } = await restrictedThread();
    const before = (await q('select low_read_seq, high_read_seq, last_seq from conversations')).rows;
    const chimes = (await q('select count(*)::int n from notifications')).rows[0].n;
    await tray(me);
    await tray(me);
    await flushBackground();
    expect((await q('select low_read_seq, high_read_seq, last_seq from conversations')).rows).toEqual(before);
    expect((await q('select count(*)::int n from notifications')).rows[0].n).toBe(chimes);
  });

  it('lifting the restriction does not move old held Whispers into the thread; new ones arrive normally', async () => {
    const { me, them } = await restrictedThread();
    await doAct(them.handle, 'unrestrict', as(me));
    await whisper(me.handle, 'after unrestricting', as(them));
    expect((await tray(me)).held.map((h) => h.body)).toEqual(['held words']);
    const bodies = (await threadOf(them.handle, as(me))).data.messages?.map((m) => m.body) ?? [];
    expect(bodies).toContain('after unrestricting');
    expect(bodies).not.toContain('held words');
  });

  it('is still there after I block them (that is where the evidence is)', async () => {
    const { me, them } = await restrictedThread();
    await doAct(them.handle, 'block', as(me));
    expect((await tray(me)).held.map((h) => h.body)).toEqual(['held words']);
  });

  it('leaves out senders whose accounts are suspended or gone', async () => {
    const { me, them } = await restrictedThread();
    await q("update users set status = 'suspended' where handle = $1", [them.handle]);
    expect((await tray(me)).held).toEqual([]);
  });
});
