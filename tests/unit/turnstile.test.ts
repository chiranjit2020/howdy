import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TURNSTILE_ACTION, assertHuman, turnstileSiteKey } from '@/modules/auth/turnstile';
import { getEnv, resetEnvCache } from '@/platform/config/env';

const ctx = { requestId: 'test' };
const answer = (body: object, status = 200) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

beforeEach(() => {
  process.env.TURNSTILE_SITE_KEY = '0x4AAAAAAAtestsitekey';
  process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAAtestsecretkey';
  resetEnvCache();
});
afterEach(() => {
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;
  resetEnvCache();
  vi.unstubAllGlobals();
});

const host = () => new URL(getEnv().APP_URL).hostname;

describe('Turnstile (the sign-up bot check)', () => {
  it('is off, and lets everything through, unless BOTH keys are set', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    resetEnvCache();
    expect(turnstileSiteKey()).toBeNull();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(assertHuman(undefined, ctx)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes a token Cloudflare vouches for, for this action and this site', async () => {
    const fetchMock = answer({ success: true, action: TURNSTILE_ACTION, hostname: host() });
    vi.stubGlobal('fetch', fetchMock);
    await expect(assertHuman('tok', ctx)).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = String(init.body);
    expect(body).toContain('response=tok');
    expect(body).toContain('secret=0x4AAAAAAAtestsecretkey'); // the secret goes to Cloudflare only
  });

  it.each([
    ['no token at all', undefined, { success: true, action: TURNSTILE_ACTION }],
    ['a token Cloudflare rejects', 'tok', { success: false, 'error-codes': ['invalid-input-response'] }],
    ['a token solved for another action', 'tok', { success: true, action: 'login' }],
    [
      'a token solved on another site',
      'tok',
      { success: true, action: TURNSTILE_ACTION, hostname: 'evil.example' },
    ],
  ])('refuses %s', async (_n, token, cf) => {
    vi.stubGlobal('fetch', answer(cf));
    await expect(assertHuman(token, ctx)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('with Cloudflare’s public TEST secret (dev), skips only the action and site checks it cannot pass', async () => {
    process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
    resetEnvCache();
    vi.stubGlobal('fetch', answer({ success: true, action: '', hostname: 'example.com' }));
    await expect(assertHuman('XXXX.DUMMY.TOKEN.XXXX', ctx)).resolves.toBeUndefined();
    // …but a "no" is still a no.
    vi.stubGlobal('fetch', answer({ success: false, 'error-codes': ['invalid-input-response'] }));
    await expect(assertHuman('tok', ctx)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('lets sign-up through when Cloudflare itself cannot be reached (an outage must not close sign-up)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(assertHuman('tok', ctx)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', answer({}, 503));
    await expect(assertHuman('tok', ctx)).resolves.toBeUndefined();
  });
});
