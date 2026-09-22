import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { resetEnvCache } from '@/platform/config/env';
import { readJson } from '@/platform/http/body';
import { clientIp } from '@/platform/http/client-ip';
import { parseCookies, serializeCookie } from '@/platform/http/cookies';
import { isSecureDeployment, sessionCookieName } from '@/modules/auth/config';
import { clearedSessionCookie, sessionCookie } from '@/modules/auth/request';
import { deviceLabel } from '@/modules/auth/sessions';

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('serializeCookie / parseCookies', () => {
  it('writes the security attributes', () => {
    const c = serializeCookie('s', 'abc', { maxAgeSec: 60, httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(c).toBe('s=abc; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax');
  });
  it('refuses values or names that would need escaping (header injection)', () => {
    expect(() => serializeCookie('s', 'a;b')).toThrow();
    expect(() => serializeCookie('s', 'a\r\nSet-Cookie: x=1')).toThrow();
    expect(() => serializeCookie('bad name', 'v')).toThrow();
  });
  it('parses a Cookie header; first duplicate wins', () => {
    const m = parseCookies('a=1; b=2; a=evil; junk; =x');
    expect(m.get('a')).toBe('1');
    expect(m.get('b')).toBe('2');
    expect(m.size).toBe(2);
    expect(parseCookies(null).size).toBe(0);
  });
});

describe('session cookie (development vs https deployment)', () => {
  it('development: plain name, HttpOnly, SameSite=Lax, no Secure', () => {
    expect(sessionCookieName()).toBe('howdy_session');
    const c = sessionCookie('T'.repeat(43), 100);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).not.toContain('Secure');
    expect(c).not.toMatch(/Domain=/i);
  });
  it('https: __Host- prefix with Secure, HttpOnly, Lax, Path=/ and no Domain (browser-enforced host lock)', () => {
    vi.stubEnv('APP_URL', 'https://howdy.example');
    resetEnvCache();
    expect(isSecureDeployment()).toBe(true);
    expect(sessionCookieName()).toBe('__Host-howdy_session');
    const c = sessionCookie('T'.repeat(43), 100);
    expect(c.startsWith('__Host-howdy_session=')).toBe(true);
    for (const part of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) expect(c).toContain(part);
    expect(c).not.toMatch(/Domain=/i);
  });
  it('every production build uses the Secure __Host- cookie, even when served from loopback over http', () => {
    vi.stubEnv('NODE_ENV', 'production');
    // Production also insists on real object storage; this test is about cookies, so declare the end-to-end test build.
    vi.stubEnv('ENABLE_TEST_STORAGE', '1');
    resetEnvCache();
    expect(isSecureDeployment()).toBe(true);
    const c = sessionCookie('T'.repeat(43), 100);
    expect(c.startsWith('__Host-howdy_session=')).toBe(true);
    expect(c).toContain('Secure');
  });
  it('the clearing cookie expires immediately and keeps the same attributes', () => {
    const c = clearedSessionCookie();
    expect(c).toMatch(/^howdy_session=;/);
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('HttpOnly');
  });
});

describe('clientIp', () => {
  const h = (xff: string) => new Headers({ 'x-forwarded-for': xff });
  it('ignores X-Forwarded-For unless a trusted proxy is configured', () => {
    expect(clientIp(h('1.2.3.4'), 0)).toBe('direct');
  });
  it('takes the entry appended by our own proxy (from the right), not the spoofable leftmost one', () => {
    expect(clientIp(h('6.6.6.6, 203.0.113.9'), 1)).toBe('203.0.113.9');
    expect(clientIp(h('6.6.6.6, 203.0.113.9, 10.0.0.1'), 2)).toBe('203.0.113.9');
  });
  it('falls back safely on junk or missing values', () => {
    expect(clientIp(h('not an ip!!'), 1)).toBe('direct');
    expect(clientIp(new Headers(), 1)).toBe('direct');
    expect(clientIp(h('1.2.3.4'), 3)).toBe('direct');
  });
});

describe('readJson', () => {
  const schema = z.object({ a: z.string().min(2, 'too short') });
  const req = (body: string, type: string | null = 'application/json') =>
    new Request('http://localhost/x', {
      method: 'POST',
      body,
      headers: type ? { 'content-type': type } : {},
    });

  it('returns validated data', async () => {
    expect(await readJson(req('{"a":"hello"}'), schema)).toEqual({ a: 'hello' });
  });
  it.each([
    ['wrong content type', req('{"a":"hello"}', 'text/plain')],
    ['missing content type', req('{"a":"hello"}', null)],
    ['invalid JSON', req('{nope')],
    ['array body', req('[1,2]')],
    ['null body', req('null')],
    ['oversized body', req(JSON.stringify({ a: 'x'.repeat(9000) }))],
  ])('rejects %s as BAD_REQUEST', async (_n, r) => {
    await expect(readJson(r, schema)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('turns schema failures into field-level errors using our own messages', async () => {
    await expect(readJson(req('{"a":"x"}'), schema)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { a: 'too short' },
    });
  });
});

describe('deviceLabel', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120.0',
      'Edge on Windows',
    ],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Chrome on Windows'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605 Version/17 Safari/605',
      'Safari on macOS',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537 Chrome/120 Mobile Safari/537', 'Chrome on Android'],
    ['curl/8.0', 'Unknown device'],
    ['', 'Unknown device'],
  ])('%s -> %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
  it('does not preserve the raw user agent', () => {
    expect(deviceLabel('Mozilla/5.0 secret-build-id-1234 Chrome/1 Windows')).not.toContain('secret-build-id');
  });
});
