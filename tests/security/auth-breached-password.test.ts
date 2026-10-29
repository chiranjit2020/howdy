import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authHandlers } from '@/modules/auth';
import { BREACHED_PASSWORD_MESSAGE, askPwnedPasswords, setBreachCheck } from '@/modules/auth/breached';
import { flushBackground } from '@/platform/background';
import { getPool } from '@/platform/db';
import {
  call,
  freshAuthState,
  tokenFrom,
  uniqueUser,
  userByEmail,
  verifiedUser,
  type TestKit,
} from '../helpers/auth';

const BREACHED = 'a password everyone has leaked';

let kit: TestKit;
beforeEach(async () => {
  kit = await freshAuthState();
  setBreachCheck(async (p) => p === BREACHED);
});
afterEach(() => {
  setBreachCheck(undefined);
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await getPool().end();
});

describe('a password from a known breach is refused', () => {
  it('at sign-up, on the password field, and no account is made', async () => {
    const u = { ...uniqueUser(), password: BREACHED };
    const r = await call(authHandlers.signup, 'POST', '/api/auth/signup', u);
    await flushBackground();
    expect(r.status).toBe(422);
    expect(r.data.error?.fields?.password).toBe(BREACHED_PASSWORD_MESSAGE);
    expect(await userByEmail(u.email)).toBeUndefined();
    expect(kit.mailer.sent).toHaveLength(0);
  });

  it('when choosing a new password from a reset link (and the link still works for a better one)', async () => {
    const u = await verifiedUser(kit);
    kit.mailer.sent.length = 0;
    await call(authHandlers.forgotPassword, 'POST', '/api/auth/forgot-password', { email: u.email });
    await flushBackground();
    const token = tokenFrom(kit.mailer.lastTo(u.email)!.text);
    const bad = await call(authHandlers.resetPassword, 'POST', '/api/auth/reset-password', {
      token,
      password: BREACHED,
    });
    expect(bad.status).toBe(422);
    expect(bad.data.error?.fields?.password).toBe(BREACHED_PASSWORD_MESSAGE);
    const good = await call(authHandlers.resetPassword, 'POST', '/api/auth/reset-password', {
      token,
      password: 'a fresh and unbreached passphrase',
    });
    expect(good.status).toBe(200);
  });
});

describe('the lookup itself', () => {
  const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();

  it('sends only the first 5 characters of the hash, and matches the rest locally', async () => {
    const hash = sha1('hunter2hunter2');
    const fetchMock = vi.fn(
      async () => new Response(`0000000000000000000000000000000000A:0\r\n${hash.slice(5)}:42\r\n`),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await askPwnedPasswords('hunter2hunter2')).toBe(true);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
  });

  it('ignores padding lines (count 0)', async () => {
    const hash = sha1('padded only');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`${hash.slice(5)}:0\r\n`)),
    );
    expect(await askPwnedPasswords('padded only')).toBe(false);
  });

  it('fails open: if the service is down, the password is allowed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await askPwnedPasswords('anything at all')).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('busy', { status: 503 })),
    );
    expect(await askPwnedPasswords('anything at all')).toBe(false);
  });
});
