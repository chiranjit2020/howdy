import { afterEach, describe, expect, it } from 'vitest';
import { GET as reportRoute } from '@/app/api/health/report/route';
import { decideEmail, formatReport, overallOf, type HealthReport } from '@/modules/health';
import { REMIND_EVERY_MS } from '@/modules/health/report';
import { checkActivity, checkSite, FAILED_LOGINS_PER_HOUR } from '@/modules/health/checks';
import { resetEnvCache } from '@/platform/config/env';

const HOUR = 60 * 60 * 1000;

describe('overall status', () => {
  const c = (status: 'ok' | 'warn' | 'fail' | 'skip') => ({ id: status, label: status, status, detail: '' });
  it('is the worst of the checks, and skipped checks never count against it', () => {
    expect(overallOf([c('ok'), c('skip')])).toBe('ok');
    expect(overallOf([c('ok'), c('warn'), c('skip')])).toBe('warn');
    expect(overallOf([c('warn'), c('fail'), c('ok')])).toBe('fail');
    expect(overallOf([])).toBe('ok');
  });
});

describe('when a watch run emails', () => {
  const at = 1_000_000_000_000;
  it('the daily digest always goes out', () => {
    expect(decideEmail('digest', 'ok', { status: 'ok', alertedAt: null }, at)).toBe('digest');
  });
  it('healthy and was healthy: stays quiet', () => {
    expect(decideEmail('watch', 'ok', null, at)).toBeNull();
    expect(decideEmail('watch', 'ok', { status: 'ok', alertedAt: null }, at)).toBeNull();
  });
  it('something goes wrong: alert at once', () => {
    expect(decideEmail('watch', 'fail', { status: 'ok', alertedAt: null }, at)).toBe('alert');
    expect(decideEmail('watch', 'warn', null, at)).toBe('alert');
  });
  it('still wrong: quiet until the reminder is due, then remind', () => {
    const last = { status: 'fail' as const, alertedAt: at - HOUR };
    expect(decideEmail('watch', 'fail', last, at)).toBeNull();
    expect(decideEmail('watch', 'fail', { ...last, alertedAt: at - REMIND_EVERY_MS }, at)).toBe('alert');
  });
  it('a warning that becomes a failure is emailed straight away', () => {
    expect(decideEmail('watch', 'fail', { status: 'warn', alertedAt: at - HOUR }, at)).toBe('alert');
  });
  it('back to healthy: one "recovered" email', () => {
    expect(decideEmail('watch', 'ok', { status: 'fail', alertedAt: at - HOUR }, at)).toBe('recovered');
  });
});

describe('activity signals', () => {
  const base = { newAccounts24h: 1, activeUsers24h: 2, failedLogins1h: 0, openReports: 0 };
  it('warns about a burst of failed sign-ins and about reports waiting for a moderator', () => {
    expect(checkActivity(base).map((c) => c.status)).toEqual(['ok', 'ok']);
    const busy = checkActivity({ ...base, failedLogins1h: FAILED_LOGINS_PER_HOUR + 1, openReports: 2 });
    expect(busy.map((c) => c.status)).toEqual(['warn', 'warn']);
    expect(busy[1]!.detail).toContain('2 report(s)');
  });
});

describe('website check', () => {
  const answer = (status: number) => (async () => new Response(null, { status })) as unknown as typeof fetch;
  it('a 5xx is a failure, a redirect or 200 is fine', async () => {
    expect((await checkSite(answer(500))).status).toBe('fail');
    expect((await checkSite(answer(200))).status).toBe('ok');
    expect((await checkSite(answer(307))).status).toBe('ok');
  });
  it('no answer at all is a failure', async () => {
    const down = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await checkSite(down);
    expect(r.status).toBe('fail');
    expect(r.detail).toContain('ECONNREFUSED');
  });
});

describe('the report email', () => {
  const report: HealthReport = {
    status: 'fail',
    checkedAt: '2026-09-27T03:30:00.000Z',
    region: 'sin1',
    commit: 'abc1234',
    durationMs: 420,
    checks: [
      { id: 'database', label: 'Database', status: 'ok', detail: 'Answering in 12 ms.' },
      { id: 'redis', label: 'Redis (rate limits)', status: 'fail', detail: 'Unreachable.' },
    ],
    activity: { newAccounts24h: 1, activeUsers24h: 2, failedLogins1h: 0, openReports: 0 },
  };
  it('leads with what needs attention, in Indian time, and says where it ran', () => {
    const { subject, text } = formatReport(report, 'alert');
    expect(subject).toBe('Howdy ALERT: something is broken');
    expect(text).toContain('9:00:00 am IST');
    expect(text.indexOf('Needs attention')).toBeLessThan(text.indexOf('Every check'));
    expect(text).toContain('[FAIL] Redis (rate limits): Unreachable.');
    expect(text).toContain('Checked from sin1, commit abc1234');
  });
  it('has its own subjects for the digest and for recovery', () => {
    expect(formatReport({ ...report, status: 'ok' }, 'digest').subject).toBe(
      'Howdy daily health: all systems healthy',
    );
    expect(formatReport({ ...report, status: 'ok' }, 'recovered').subject).toBe(
      'Howdy recovered: all systems healthy',
    );
  });
});

describe('/api/health/report', () => {
  const env = process.env as Record<string, string | undefined>;
  const call = (auth?: string) =>
    reportRoute(
      new Request('http://localhost:3000/api/health/report', {
        headers: auth ? { authorization: auth } : {},
      }),
    );
  afterEach(() => {
    delete env.CRON_SECRET;
    resetEnvCache();
  });

  it('does not exist until a secret is configured', async () => {
    delete env.CRON_SECRET;
    resetEnvCache();
    expect((await call('Bearer anything')).status).toBe(404);
  });
  it('refuses a missing or wrong secret without running anything', async () => {
    env.CRON_SECRET = 'a'.repeat(40);
    resetEnvCache();
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${'b'.repeat(40)}`)).status).toBe(401);
    expect((await call('a'.repeat(40))).status).toBe(401); // no "Bearer "
  });
});
