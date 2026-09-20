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
