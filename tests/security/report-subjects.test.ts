import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as reportPortraitRoute } from '@/app/api/reports/portrait/[handle]/route';
import { POST as reportTownHallRoute } from '@/app/api/reports/town-hall/[id]/route';
import { POST as reportWhisperRoute } from '@/app/api/reports/whisper/[id]/route';
import { GET as reportedPortraitRoute } from '@/app/api/moderation/reports/[id]/portrait/route';
import { purgeClosedReports } from '@/modules/moderation';
import { getPool } from '@/platform/db';
import { settledUser, freshAuthState, request, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { freshStore, getPortrait, jpeg, png, uploadPortrait } from '../helpers/media';
import { actOnReport, makeRole, queue, type QueueItem } from '../helpers/moderation';
import { doAct, q, report } from '../helpers/social';
import { create as createTownHall } from '../helpers/town-halls';
import { whisper } from '../helpers/whispers';

/** ADR-025: reporting a photo, one Whisper, or a Town Hall — and what a moderator can then do about it. */

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
const REASON = { reason: 'inappropriate' };

async function send(
  handler: (req: Request, arg?: { params?: Promise<Record<string, string>> }) => Promise<Response>,
  path: string,
  params: Record<string, string>,
  body: unknown,
  opts: { cookie?: string } = {},
) {
  const res = await handler(request('POST', path, body, opts), { params: Promise.resolve(params) });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, data, text };
}
const reportPhoto = (handle: string, body: unknown, opts = {}) =>
  send(reportPortraitRoute, `/api/reports/portrait/${handle}`, { handle }, body, opts);
const reportWhisper = (id: string, body: unknown, opts = {}) =>
  send(reportWhisperRoute, `/api/reports/whisper/${id}`, { id }, body, opts);
const reportHall = (id: string, body: unknown, opts = {}) =>
  send(reportTownHallRoute, `/api/reports/town-hall/${id}`, { id }, body, opts);
async function seePhoto(reportId: string, opts = {}) {
  const res = await reportedPortraitRoute(
    request('GET', `/api/moderation/reports/${reportId}/portrait`, undefined, opts),
    { params: Promise.resolve({ id: reportId }) },
  );
  return { status: res.status, bytes: Buffer.from(await res.arrayBuffer()) };
}

async function moderator(): Promise<P> {
  const m = await person('mod');
  await makeRole(m.handle, 'moderator');
  return m;
}
const reportRow = async (id: string) => (await q('select * from reports where id = $1', [id])).rows[0];
const audit = async (event: string) => (await q('select meta from audit_log where event = $1', [event])).rows;
const firstOpen = async (mod: P): Promise<QueueItem> => (await queue(as(mod))).data.reports![0]!;

async function pals(a: P, b: P) {
  await doAct(b.handle, 'request', as(a));
  await doAct(a.handle, 'accept', as(b));
}
async function withPhoto(p: P) {
  expect((await uploadPortrait(p.cookie, await jpeg(600, 600))).done?.status).toBe(200);
  return (
    await q('select id from media where owner_id = (select id from users where handle = $1)', [p.handle])
  ).rows[0].id as string;
}

describe('reporting a photo', () => {
  it('names the exact photo; a moderator sees it and can remove just that photo', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    const mediaId = await withPhoto(owner);
    expect((await reportPhoto(owner.handle, REASON, as(reporter))).status).toBe(202);

    const item = await firstOpen(mod);
    expect(item).toMatchObject({ subject: 'portrait', canRemove: true, target: { handle: owner.handle } });
    expect((await reportRow(item.id)).media_id).toBe(mediaId);
    const seen = await seePhoto(item.id, as(mod));
    expect(seen.status).toBe(200);
    expect(seen.bytes.length).toBeGreaterThan(100);

    expect((await actOnReport(item.id, 'remove_portrait', as(mod))).status).toBe(200);
    expect((await getPortrait(owner.handle, as(reporter))).status).toBe(404);
    expect(await statusOfAccount(owner.handle)).toBe('active'); // the photo, not the person
    expect(await audit('portrait_removed')).toHaveLength(1);
    expect((await seePhoto(item.id, as(mod))).status).toBe(404);
  });

  it('a photo replaced since the report is not the one reported: left alone, and the report stays open', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    await withPhoto(owner);
    await reportPhoto(owner.handle, REASON, as(reporter));
    const item = await firstOpen(mod);
    expect((await uploadPortrait(owner.cookie, await png(400, 400), 'image/png')).done?.status).toBe(200);

    expect((await queue(as(mod))).data.reports![0]!.canRemove).toBe(false);
    expect((await seePhoto(item.id, as(mod))).status).toBe(404);
    // The replaced file's row is gone, so the report no longer points at anything: nothing to remove.
    expect((await actOnReport(item.id, 'remove_portrait', as(mod))).status).toBe(400);
    expect((await getPortrait(owner.handle, as(reporter))).status).toBe(200);
    expect((await reportRow(item.id)).status).toBe('open');
  });

  it('a leftover old photo (its clean-up failed) is never confused with the current one', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    const oldId = await withPhoto(owner);
    await reportPhoto(owner.handle, REASON, as(reporter));
    const item = await firstOpen(mod);
    // The reported photo is retired but its row lingers (as when deleting its file failed); then a new one goes up.
    await q("update media set status = 'retired' where id = $1", [oldId]);
    expect((await uploadPortrait(owner.cookie, await png(400, 400), 'image/png')).done?.status).toBe(200);
    expect((await reportRow(item.id)).media_id).toBe(oldId);

    expect((await queue(as(mod))).data.reports![0]!.canRemove).toBe(false);
    expect((await seePhoto(item.id, as(mod))).status).toBe(404);
    expect((await actOnReport(item.id, 'remove_portrait', as(mod))).status).toBe(409);
    expect((await getPortrait(owner.handle, as(reporter))).status).toBe(200);
    expect((await reportRow(item.id)).status).toBe('open');
  });

  it('only someone who can see the photo can report it; no photo, hidden, missing and myself are all the same 404', async () => {
    const reporter = await person('reporter');
    const noPhoto = await person('nophoto');
    const hidden = await person('hidden');
    await withPhoto(hidden);
    await q(
      "update profiles set ranch_visibility = 'posse' where user_id = (select id from users where handle = $1)",
      [hidden.handle],
    );
    await withPhoto(reporter);
    const missing = await reportPhoto('nobody_home', REASON, as(reporter));
    expect(missing.status).toBe(404);
    for (const r of [
      await reportPhoto(noPhoto.handle, REASON, as(reporter)),
      await reportPhoto(hidden.handle, REASON, as(reporter)),
      await reportPhoto(reporter.handle, REASON, as(reporter)),
    ]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect((await q('select count(*)::int n from reports')).rows[0].n).toBe(0);
  });

  it('the reported photo is for moderators only', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    await withPhoto(owner);
    await reportPhoto(owner.handle, REASON, as(reporter));
    const item = await firstOpen(mod);
    expect((await seePhoto(item.id, as(reporter))).status).toBe(404);
    expect((await seePhoto(item.id)).status).toBe(401);
  });
});

async function statusOfAccount(handle: string) {
  return (await q('select status from users where handle = $1', [handle])).rows[0].status as string;
}

describe('reporting a Whisper', () => {
  async function thread() {
    const sender = await person('sender');
    const recipient = await person('recipient');
    await pals(sender, recipient);
    const sent = await whisper(recipient.handle, 'something nasty', as(sender));
    expect(sent.status).toBeLessThan(300);
    const mine = await whisper(sender.handle, 'my reply', as(recipient));
    return {
      sender,
      recipient,
      id: (sent.data as { message: { id: string } }).message.id,
      myId: (mine.data as { message: { id: string } }).message.id,
    };
  }

  it('the recipient reports one message: only its words go to the queue, never the thread', async () => {
    const { sender, recipient, id } = await thread();
    const mod = await moderator();
    expect((await reportWhisper(id, REASON, as(recipient))).status).toBe(202);
    const item = await firstOpen(mod);
    expect(item).toMatchObject({
      subject: 'whisper',
      evidenceText: 'something nasty',
      canRemove: true,
      target: { handle: sender.handle },
    });
    expect(JSON.stringify(await queue(as(mod)))).not.toContain('my reply');
  });

  it('still works after blocking the sender (that is when people report)', async () => {
    const { sender, recipient, id } = await thread();
    await doAct(sender.handle, 'block', as(recipient));
    expect((await reportWhisper(id, REASON, as(recipient))).status).toBe(202);
  });

  it('my own Whisper, someone else’s thread and a made-up id are all the same 404; a held one only its recipient may report', async () => {
    const { sender, recipient, id, myId } = await thread();
    const outsider = await person('outsider');
    const missing = await reportWhisper('00000000-0000-4000-8000-000000000000', REASON, as(recipient));
    expect(missing.status).toBe(404);
    // a Whisper from someone the recipient restricted: held, shown to them only in their held tray (ADR-026)
    await doAct(sender.handle, 'restrict', as(recipient));
    const held = await whisper(recipient.handle, 'held back', as(sender));
    const heldId = (held.data as { message: { id: string } }).message.id;
    for (const r of [
      await reportWhisper(myId, REASON, as(recipient)),
      await reportWhisper(id, REASON, as(outsider)),
      await reportWhisper(id, REASON, as(sender)),
      await reportWhisper(heldId, REASON, as(outsider)),
      await reportWhisper(heldId, REASON, as(sender)),
      await reportWhisper('../x', REASON, as(recipient)),
    ]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
    expect((await q('select count(*)::int n from reports')).rows[0].n).toBe(0);
    // The recipient can read the held Whisper in their tray, so they can report it.
    expect((await reportWhisper(heldId, REASON, as(recipient))).status).toBe(202);
    expect((await q('select evidence_text from reports')).rows).toEqual([{ evidence_text: 'held back' }]);
  });

  it('removing it deletes that one message for both sides and keeps the evidence', async () => {
    const { recipient, id, myId } = await thread();
    const mod = await moderator();
    await reportWhisper(id, REASON, as(recipient));
    const item = await firstOpen(mod);
    expect((await actOnReport(item.id, 'remove_whisper', as(mod))).status).toBe(200);
    expect((await q('select count(*)::int n from messages where id = $1', [id])).rows[0].n).toBe(0);
    expect((await q('select count(*)::int n from messages where id = $1', [myId])).rows[0].n).toBe(1);
    expect(await reportRow(item.id)).toMatchObject({ evidence_text: 'something nasty', status: 'actioned' });
    expect(await audit('whisper_removed')).toHaveLength(1);
  });

  it('once the Whisper is gone (7-day retention) the report remains, but there is nothing to remove', async () => {
    const { recipient, id } = await thread();
    const mod = await moderator();
    await reportWhisper(id, REASON, as(recipient));
    await q('delete from messages where id = $1', [id]);
    const item = await firstOpen(mod);
    expect(item).toMatchObject({ canRemove: false, evidenceText: 'something nasty' });
    expect((await actOnReport(item.id, 'remove_whisper', as(mod))).status).toBe(400);
  });
});

describe('reporting a Town Hall', () => {
  async function hall(visibility = 'open') {
    const owner = await person('owner');
    const r = await createTownHall({ name: 'Bad Hall', description: 'Rude things', visibility }, as(owner));
    expect(r.status).toBe(201);
    return { owner, id: (r.data as { townHall: { id: string } }).townHall.id };
  }

  it('goes against its owner with its name and description as evidence; removing it deletes it', async () => {
    const { owner, id } = await hall();
    const reporter = await person('reporter');
    const mod = await moderator();
    expect((await reportHall(id, REASON, as(reporter))).status).toBe(202);
    const item = await firstOpen(mod);
    expect(item).toMatchObject({
      subject: 'town_hall',
      canRemove: true,
      evidenceText: 'Bad Hall\n\nRude things',
      target: { handle: owner.handle },
    });
    expect((await actOnReport(item.id, 'remove_town_hall', as(mod))).status).toBe(200);
    expect((await q('select count(*)::int n from town_halls where id = $1', [id])).rows[0].n).toBe(0);
    expect(await audit('town_hall_removed')).toHaveLength(1);
  });

  it('an invite-only Town Hall I cannot see, my own, and a made-up id are all the same 404', async () => {
    const { owner, id } = await hall('invite');
    const reporter = await person('reporter');
    const missing = await reportHall('00000000-0000-4000-8000-000000000000', REASON, as(reporter));
    expect(missing.status).toBe(404);
    for (const r of [await reportHall(id, REASON, as(reporter)), await reportHall(id, REASON, as(owner))]) {
      expect(r.status).toBe(404);
      expect(stable(r.data)).toBe(stable(missing.data));
    }
  });
});

describe('retention: closed reports go a year after closing', () => {
  it('deletes closed reports (words and who-reported-whom) after a year; keeps younger and open ones', async () => {
    const reporter = await person('reporter');
    const mod = await moderator();
    const targets = [await person('a'), await person('b'), await person('c'), await person('d')];
    for (const t of targets)
      await report({ handle: t.handle, reason: 'spam', details: 'words' }, as(reporter));
    const ids = (await queue(as(mod))).data.reports!.map((r) => r.id);
    await actOnReport(ids[0]!, 'dismiss', as(mod));
    await actOnReport(ids[1]!, 'dismiss', as(mod));
    await actOnReport(ids[2]!, 'dismiss', as(mod));
    // one closed 13 months ago, one closed 11 months ago, one closed just now; ids[3] stays open (filed long ago)
    await q("update reports set reviewed_at = now() - interval '13 months' where id = $1", [ids[0]]);
    await q("update reports set reviewed_at = now() - interval '11 months' where id = $1", [ids[1]]);
    await q("update reports set created_at = now() - interval '3 years' where id = $1", [ids[3]]);

    expect(await purgeClosedReports()).toEqual({ reportsPurged: 1 });
    const left = (await q('select id from reports')).rows.map((r) => r.id as string).sort();
    expect(left).toEqual([ids[1]!, ids[2]!, ids[3]!].sort());
    expect(await purgeClosedReports()).toEqual({ reportsPurged: 0 });
  });
});

describe('one report per kind of thing', () => {
  it('reporting the person and then their photo files both; repeating either is a no-op', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    await withPhoto(owner);
    expect((await report({ handle: owner.handle, reason: 'spam' }, as(reporter))).status).toBe(202);
    expect((await reportPhoto(owner.handle, REASON, as(reporter))).status).toBe(202);
    expect((await reportPhoto(owner.handle, REASON, as(reporter))).status).toBe(202);
    const rows = (await q('select subject from reports order by subject')).rows.map((r) => r.subject);
    expect(rows).toEqual(['person', 'portrait']);
  });

  it('a remove action for the wrong kind of report is refused and changes nothing', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    await withPhoto(owner);
    await reportPhoto(owner.handle, REASON, as(reporter));
    const item = await firstOpen(mod);
    for (const action of ['remove_card', 'remove_whisper', 'remove_town_hall']) {
      expect((await actOnReport(item.id, action, as(mod))).status).toBe(400);
    }
    expect((await reportRow(item.id)).status).toBe('open');
    expect((await getPortrait(owner.handle, as(reporter))).status).toBe(200);
  });

  it('members cannot use the remove actions (the moderation area stays a 404)', async () => {
    const owner = await person('owner');
    const reporter = await person('reporter');
    const mod = await moderator();
    await withPhoto(owner);
    await reportPhoto(owner.handle, REASON, as(reporter));
    const item = await firstOpen(mod);
    expect((await actOnReport(item.id, 'remove_portrait', as(reporter))).status).toBe(404);
    expect((await getPortrait(owner.handle, as(reporter))).status).toBe(200);
  });
});
