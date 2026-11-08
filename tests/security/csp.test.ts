import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildCsp, proxy, STREAMED_SVG_STYLE_HASH } from '@/proxy';

describe('Content-Security-Policy', () => {
  it('production policy is nonce-based with no unsafe script/style', () => {
    const csp = buildCsp('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).not.toMatch(/style-src [^;]*unsafe/);
  });

  it('style attributes: only React’s streamed `display:none`, by hash, and nothing else', () => {
    const csp = buildCsp('abc123', false);
    expect(STREAMED_SVG_STYLE_HASH).toBe(
      `sha256-${createHash('sha256').update('display:none').digest('base64')}`,
    );
    const attr = csp.split('; ').filter((d) => d.startsWith('style-src-attr'));
    expect(attr).toEqual([`style-src-attr 'unsafe-hashes' '${STREAMED_SVG_STYLE_HASH}'`]);
  });

  it('production policy keeps the other hardening directives', () => {
    const csp = buildCsp('abc123', false);
    for (const d of [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests',
    ]) {
      expect(csp).toContain(d);
    }
  });

  it('production allows no sockets at all unless one origin is configured, and then only that one', () => {
    expect(buildCsp('n', false)).toContain("connect-src 'self'; ");
    expect(buildCsp('n', false)).not.toMatch(/connect-src[^;]*wss?:/);
    const csp = buildCsp('n', false, 'wss://ws.howdy.example');
    expect(csp).toContain("connect-src 'self' wss://ws.howdy.example;");
    expect(csp).not.toMatch(/connect-src[^;]*\swss?:(?!\/\/)/); // no scheme-wide wildcard
  });

  it('photo uploads may go to the one configured bucket origin, and nowhere else', () => {
    const bucket = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
    expect(buildCsp('n', false, undefined, bucket)).toContain(`connect-src 'self' ${bucket};`);
    expect(buildCsp('n', false, 'wss://ws.howdy.example', bucket)).toContain(
      `connect-src 'self' wss://ws.howdy.example ${bucket};`,
    );
    // Not configured (local files): nothing is added, and never a wildcard.
    expect(buildCsp('n', false)).not.toMatch(/connect-src[^;]*(r2|cloudflare|\*)/);
    expect(buildCsp('n', false, undefined, bucket)).not.toMatch(/connect-src[^;]*\*/);
    // Images and everything else stay same-origin: photos are served by the app, never straight from the bucket.
    expect(buildCsp('n', false, undefined, bucket)).toContain("img-src 'self' blob: data:;");
  });

  it('frames only Cloudflare Turnstile, and only when it is set up', () => {
    expect(buildCsp('n', false)).not.toContain('frame-src');
    expect(buildCsp('n', false)).not.toContain('challenges.cloudflare.com');
    const csp = buildCsp('n', false, undefined, undefined, false, true);
    expect(csp).toContain('frame-src https://challenges.cloudflare.com;');
    expect(csp).toMatch(/script-src [^;]*'strict-dynamic' https:\/\/challenges\.cloudflare\.com/);
    expect(csp).not.toMatch(/connect-src[^;]*cloudflare/); // nothing else opens up
  });

  it('proxy issues a fresh nonce per request and ignores client-supplied request ids', () => {
    const mk = () => new NextRequest('http://localhost:3000/', { headers: { 'x-request-id': 'attacker' } });
    const a = proxy(mk());
    const b = proxy(mk());
    const nonce = (r: Response) =>
      /'nonce-([^']+)'/.exec(r.headers.get('content-security-policy') ?? '')?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
  });

  describe('opening screen (once per visit, no script)', () => {
    const page = (headers: Record<string, string> = {}) =>
      new NextRequest('http://localhost:3000/home', {
        headers: { 'sec-fetch-dest': 'document', ...headers },
      });
    // What the page will see: NextResponse.next passes rewritten request headers along like this.
    const marked = (r: Response) => r.headers.get('x-middleware-request-x-howdy-splash');
    const setsCookie = (r: Response) => (r.headers.get('set-cookie') ?? '').includes('howdy_hello=1');

    it('the first page load of a visit is marked, and a session cookie (no expiry) is set', () => {
      const r = proxy(page());
      expect(marked(r)).toBe('1');
      const cookie = r.headers.get('set-cookie') ?? '';
      expect(cookie).toMatch(/howdy_hello=1/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
    });

    it('not again once the cookie is there', () => {
      const r = proxy(page({ cookie: 'howdy_hello=1' }));
      expect(marked(r)).toBeNull();
      expect(setsCookie(r)).toBe(false);
    });

    it('never for a client navigation, a fetch or an asset', () => {
      expect(marked(proxy(page({ rsc: '1' })))).toBeNull();
      expect(marked(proxy(page({ 'sec-fetch-dest': 'empty' })))).toBeNull();
      expect(marked(proxy(page({ 'sec-fetch-dest': 'image' })))).toBeNull();
    });

    it('a client cannot turn it on by sending the header itself', () => {
      const r = proxy(page({ cookie: 'howdy_hello=1', 'x-howdy-splash': '1' }));
      expect(marked(r)).toBeNull();
    });
  });
});
