import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { buildCsp, proxy } from '@/proxy';

describe('Content-Security-Policy', () => {
  it('production policy is nonce-based with no unsafe script/style', () => {
    const csp = buildCsp('abc123', false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).not.toMatch(/style-src[^;]*unsafe/);
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

  it('proxy issues a fresh nonce per request and ignores client-supplied request ids', () => {
    const mk = () => new NextRequest('http://localhost:3000/', { headers: { 'x-request-id': 'attacker' } });
    const a = proxy(mk());
    const b = proxy(mk());
    const nonce = (r: Response) =>
      /'nonce-([^']+)'/.exec(r.headers.get('content-security-policy') ?? '')?.[1];
    expect(nonce(a)).toBeTruthy();
    expect(nonce(a)).not.toBe(nonce(b));
  });
});
