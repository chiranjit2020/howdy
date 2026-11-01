import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PATCH as markRoute } from '@/app/api/admin/feedback/[id]/route';
import { POST as sendRoute } from '@/app/api/feedback/route';
import { listFeedback, purgeOldFeedback, setFeedbackStatus } from '@/modules/feedback';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  call,
  expectAppError,
  freshAuthState,
  request,
  settledUser,
  uniqueUser,
  type TestKit,
} from '../helpers/auth';
import { makeRole } from '../helpers/moderation';
import { q, userId } from '../helpers/social';

/** Feedback about Howdy (ADR-059): anyone signed in may send it, within limits; only ready admins may read it. */

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

type P = Awaited<ReturnType<typeof settledUser>>;
const person = (tag: string) => settledUser(kit, uniqueUser(tag));
const as = (p: P) => ({ cookie: p.cookie });
const send = (body: unknown, who?: P) => call(sendRoute, 'POST', '/api/feedback', body, who ? as(who) : {});

describe('sending', () => {
  it('needs a session; saves what is given (trimmed) as the signed-in person, whatever "from" is claimed', async () => {
    expect((await send({ kind: 'idea', body: 'Hello' })).status).toBe(401);
    const a = await person('sender');
    const b = await person('other');
    const res = await send(
      {
        kind: 'broken',
        body: '  The send button froze  ',
        page: '/messages/x',
        userId: await userId(b.handle),
      },
      a,
    );
    expect(res.status).toBe(201);
    const { rows } = await q('select user_id, kind, body, page, status from feedback');
    expect(rows).toEqual([
      {
        user_id: await userId(a.handle),
        kind: 'broken',
        body: 'The send button froze',
        page: '/messages/x',
        status: 'new',
      },
    ]);
  });

  it('refuses empty or long words, unknown kinds, disguising characters and pages that are not plain in-app paths', async () => {
    const a = await person('strict');
    for (const body of [
      { kind: 'idea', body: '   ' },
      { kind: 'idea', body: 'x'.repeat(1001) },
      { kind: 'praise', body: 'hi' },
      { kind: 'idea', body: 'hi\u202Ethere' },
      { kind: 'idea', body: 'hi', page: 'https://evil.example/' },
      { kind: 'idea', body: 'hi', page: '/home?token=secret' },
      { kind: 'idea', body: 'hi', page: '//evil.example' },
      {},
    ])
      expect((await send(body, a)).status, JSON.stringify(body).slice(0, 50)).toBe(422);
    expect((await q('select count(*)::int n from feedback')).rows[0].n).toBe(0);
  });

  it('is limited per person (5 an hour), so it cannot be used to flood the team', async () => {
    const a = await person('chatty');
    for (let i = 0; i < 5; i++)
      expect((await send({ kind: 'other', body: `note ${i}` }, a)).status).toBe(201);
    expect((await send({ kind: 'other', body: 'one more' }, a)).status).toBe(429);
  });

  it('every ready admin is emailed a copy, with who sent it and the page; nobody else is', async () => {
    const [admin, member] = await Promise.all([person('admin'), person('member')]);
    await makeRole(admin.handle, 'admin');
    await send({ kind: 'idea', body: 'Dark mode please', page: '/settings' }, member);
    await flushBackground();
    const mail = kit.mailer.lastTo(admin.email);
    expect(mail?.subject).toBe('Howdy feedback: An idea');
    expect(mail?.text).toContain('Dark mode please');
    expect(mail?.text).toContain(`@${member.handle}`);
    expect(mail?.text).toContain('Page: /settings');
    expect(kit.mailer.lastTo(member.email)?.subject ?? '').not.toContain('Howdy feedback');
  });
});

describe('reading and marking (Control Room)', () => {
  it('only an admin with two-step may list or mark it; everyone else gets the plain 404', async () => {
    const [member, mod, bareAdmin, admin] = await Promise.all([
      person('member'),
      person('mod'),
      person('bareadmin'),
      person('admin'),
    ]);
    await makeRole(mod.handle, 'moderator');
    await makeRole(bareAdmin.handle, 'admin', { twoStep: false });
    await makeRole(admin.handle, 'admin');
    await send({ kind: 'idea', body: 'More covers' }, member);
    const [{ id }] = (await q('select id from feedback')).rows as [{ id: string }];

    for (const p of [member, mod, bareAdmin]) {
      const pid = await userId(p.handle);
      expectAppError(await listFeedback(pid).catch((e) => e), 'NOT_FOUND');
      expectAppError(await setFeedbackStatus(pid, id, 'done').catch((e) => e), 'NOT_FOUND');
    }
    // Through the API too: a member marking it is a 404, and nothing changes.
    const denied = await markRoute(
      request('PATCH', `/api/admin/feedback/${id}`, { status: 'done' }, as(member)),
      {
        params: Promise.resolve({ id }),
      },
    );
    expect(denied.status).toBe(404);
    expect((await q('select status from feedback where id = $1', [id])).rows[0].status).toBe('new');

    const aid = await userId(admin.handle);
    const list = await listFeedback(aid);
    expect(list.unread).toBe(1);
    expect(list.items[0]).toMatchObject({
      kind: 'idea',
      body: 'More covers',
      from: { handle: member.handle },
    });
    await setFeedbackStatus(aid, id, 'done');
    const row = (await q('select status, handled_at from feedback where id = $1', [id])).rows[0];
    expect(row.status).toBe('done');
    expect(row.handled_at).not.toBeNull();
    await setFeedbackStatus(aid, id, 'new');
    expect((await q('select handled_at from feedback where id = $1', [id])).rows[0].handled_at).toBeNull();
    expectAppError(
      await setFeedbackStatus(aid, '00000000-0000-4000-8000-000000000000', 'read').catch((e) => e),
      'NOT_FOUND',
    );
  });
});

describe('keeping it', () => {
  it('the database refuses what the app would; deleting the account deletes it; a year later it is purged', async () => {
    const a = await person('keeper');
    const aid = await userId(a.handle);
    for (const [col, value] of [
      ['kind', 'praise'],
      ['status', 'archived'],
      ['body', ''],
      ['page', 'https://evil.example'],
    ] as const) {
      const row = { kind: 'idea', body: 'ok', page: null as string | null, status: 'new', [col]: value };
      await expect(
        q('insert into feedback (user_id, kind, body, page, status) values ($1, $2, $3, $4, $5)', [
          aid,
          row.kind,
          row.body,
          row.page,
          row.status,
        ]),
        col,
      ).rejects.toThrow(/feedback_/);
    }
    await send({ kind: 'idea', body: 'old' }, a);
    await q("update feedback set created_at = now() - interval '366 days' where body = 'old'");
    await send({ kind: 'idea', body: 'recent' }, a);
    expect((await purgeOldFeedback()).feedback).toBe(1);
    await q('delete from users where id = $1', [aid]);
    expect((await q('select count(*)::int n from feedback')).rows[0].n).toBe(0);
  });
});
