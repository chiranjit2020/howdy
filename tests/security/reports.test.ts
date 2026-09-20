import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { RATE } from '@/modules/moderation/service';
import { getPool } from '@/platform/db';
import { setRateLimiter } from '@/platform/rate-limit';
import { freshAuthState, signedInUser, stable, uniqueUser, type TestKit } from '../helpers/auth';
import { doAct, insertUser, q, report, userId } from '../helpers/social';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
});
afterAll(async () => {
  await getPool().end();
});

const person = (tag: string) => signedInUser(kit, uniqueUser(tag));
const as = (p: { cookie: string }) => ({ cookie: p.cookie });
const rows = async () => (await q('select * from reports order by created_at')).rows;
const u = (cp: number) => String.fromCodePoint(cp);

describe('Flag trouble', () => {
  it('records a report, answers 202, and tells the reported person nothing', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    const r = await report(
      { handle: b.handle, reason: 'harassment', details: 'Keeps messaging me after I asked them to stop.' },
      as(a),
    );
    expect(r.status).toBe(202);
    expect(r.data).toEqual({ ok: true });
    const [row] = await rows();
    expect(row).toMatchObject({
      reporter_id: await userId(a.handle),
      target_user_id: await userId(b.handle),
      reason: 'harassment',
      status: 'open',
    });
    expect(row.details).toContain('Keeps messaging');
    expect(kit.mailer.sent.filter((m) => m.to === b.email && /report/i.test(m.subject))).toEqual([]);
  });

  it('repeating a report while one is open is an identical no-op (no flooding, no oracle)', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    const first = await report({ handle: b.handle, reason: 'spam' }, as(a));
    const second = await report({ handle: b.handle, reason: 'harassment', details: 'again' }, as(a));
    expect(second.status).toBe(202);
    expect(stable(second.data)).toBe(stable(first.data));
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0].reason).toBe('spam'); // the original stands
  });

  it('once a report is closed, the same person can report again', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    await report({ handle: b.handle, reason: 'spam' }, as(a));
    await q("update reports set status = 'dismissed'");
    await report({ handle: b.handle, reason: 'harassment' }, as(a));
    expect(await rows()).toHaveLength(2);
  });

  it('handles are case-insensitive; an unknown, malformed or suspended target is a plain 404', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    expect((await report({ handle: b.handle.toUpperCase(), reason: 'spam' }, as(a))).status).toBe(202);
    const missing = await report({ handle: 'nobody_home', reason: 'spam' }, as(a));
    expect(missing.status).toBe(404);
    expect((await report({ handle: '../x', reason: 'spam' }, as(a))).status).toBe(422);
    await q("update users set status = 'suspended' where handle = $1", [b.handle]);
    expect(stable((await report({ handle: b.handle, reason: 'other' }, as(a))).data)).toBe(
      stable(missing.data),
    );
  });

  it('you cannot report yourself', async () => {
    const a = await person('reporter');
    expect((await report({ handle: a.handle, reason: 'spam' }, as(a))).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it('someone who was blocked can still report the person who blocked them (safety first)', async () => {
    const a = await person('harasser');
    const b = await person('victim');
    await doAct(a.handle, 'block', as(b));
    expect((await report({ handle: b.handle, reason: 'harassment' }, as(a))).status).toBe(202);
    // ...and the victim can report too
    expect((await report({ handle: a.handle, reason: 'harassment' }, as(b))).status).toBe(202);
    expect(await rows()).toHaveLength(2);
  });
});

describe('report input is validated', () => {
  it.each([
    ['unknown reason', { reason: 'rude' }],
    ['no reason', { reason: undefined }],
    ['details over 500 characters', { details: 'x'.repeat(501) }],
    ['a bidi override in the details', { details: `look${u(0x202e)}here` }],
    ['a zero-width space in the details', { details: `ha${u(0x200b)}rm` }],
  ])('rejects %s (422) and stores nothing', async (_n, patch) => {
    const a = await person('reporter');
    const b = await person('reported');
    const r = await report({ handle: b.handle, reason: 'spam', ...patch }, as(a));
    expect(r.status).toBe(422);
    expect(await rows()).toHaveLength(0);
  });

  it('details may contain links (evidence) and are stored as plain text, trimmed and normalised', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    await report(
      { handle: b.handle, reason: 'spam', details: '  See   https://evil.example/scam  <b>x</b>  ' },
      as(a),
    );
    expect((await rows())[0].details).toBe('See https://evil.example/scam <b>x</b>');
  });

  it('extra fields are ignored (no way to set the status or the reporter)', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    const c = await person('other');
    await report(
      {
        handle: b.handle,
        reason: 'spam',
        status: 'actioned',
        reporterId: await userId(c.handle),
        reporter_id: await userId(c.handle),
      },
      as(a),
    );
    expect((await rows())[0]).toMatchObject({ status: 'open', reporter_id: await userId(a.handle) });
  });
});

describe('access and abuse', () => {
  it('signed-out callers get 401; cross-site requests are refused with no effect', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    expect((await report({ handle: b.handle, reason: 'spam' })).status).toBe(401);
    expect(
      (
        await report(
          { handle: b.handle, reason: 'spam' },
          { cookie: a.cookie, origin: 'https://evil.example' },
        )
      ).status,
    ).toBe(403);
    expect(await rows()).toHaveLength(0);
  });

  it('a person can file 10 reports a day, then is throttled (and it fails closed)', async () => {
    const a = await person('reporter');
    const targets = await Promise.all(Array.from({ length: RATE.report.limit + 1 }, () => insertUser()));
    for (const t of targets.slice(0, RATE.report.limit))
      expect((await report({ handle: t.handle, reason: 'spam' }, as(a))).status).toBe(202);
    const over = await report({ handle: targets[RATE.report.limit]!.handle, reason: 'spam' }, as(a));
    expect(over.status).toBe(429);
    expect(await rows()).toHaveLength(RATE.report.limit);

    setRateLimiter({ consume: async () => Promise.reject(new Error('redis down')) });
    expect((await report({ handle: targets[0]!.handle, reason: 'other' }, as(a))).status).toBe(500);
  }, 60_000);
});

describe('evidence outlives accounts (docs/DATA_LIFECYCLE.md)', () => {
  it('deleting the reporter or the reported keeps the report, with the identifier removed', async () => {
    const a = await person('reporter');
    const b = await person('reported');
    await report({ handle: b.handle, reason: 'harassment', details: 'kept as evidence' }, as(a));
    await q('delete from users where handle = $1', [b.handle]);
    expect((await rows())[0]).toMatchObject({
      target_user_id: null,
      reporter_id: await userId(a.handle),
      details: 'kept as evidence',
    });
    await q('delete from users where handle = $1', [a.handle]);
    expect((await rows())[0]).toMatchObject({ target_user_id: null, reporter_id: null });
  });

  it('the database rejects self-reports, unknown reasons and statuses, and over-long details', async () => {
    const a = await insertUser();
    const b = await insertUser();
    await expect(
      q("insert into reports (reporter_id, target_user_id, reason) values ($1, $1, 'spam')", [a.id]),
    ).rejects.toThrow(/reports_not_self/);
    await expect(
      q("insert into reports (reporter_id, target_user_id, reason) values ($1, $2, 'rude')", [a.id, b.id]),
    ).rejects.toThrow(/reports_reason_check/);
    await expect(
      q(
        "insert into reports (reporter_id, target_user_id, reason, status) values ($1, $2, 'spam', 'solved')",
        [a.id, b.id],
      ),
    ).rejects.toThrow(/reports_status_check/);
    await expect(
      q("insert into reports (reporter_id, target_user_id, reason, details) values ($1, $2, 'spam', $3)", [
        a.id,
        b.id,
        'x'.repeat(501),
      ]),
    ).rejects.toThrow(/reports_details_len/);
  });
});
