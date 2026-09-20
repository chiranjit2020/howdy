import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from '@/platform/http/csrf';

const APP = 'http://localhost:3000';
const req = (method: string, headers: Record<string, string> = {}) =>
  new Request(`${APP}/api/x`, { method, headers });

describe('assertSameOrigin (CSRF)', () => {
  it('never blocks safe methods', () => {
    expect(() => assertSameOrigin(req('GET'), APP)).not.toThrow();
    expect(() => assertSameOrigin(req('HEAD', { origin: 'https://evil.example' }), APP)).not.toThrow();
  });

  it('accepts a matching Origin', () => {
    expect(() => assertSameOrigin(req('POST', { origin: APP }), APP)).not.toThrow();
  });

  it('rejects a cross-site Origin', () => {
    expect(() => assertSameOrigin(req('POST', { origin: 'https://evil.example' }), APP)).toThrowError(
      expect.objectContaining({ code: 'CSRF_REJECTED' }),
    );
  });

  it('rejects origins that only look similar', () => {
    for (const origin of [
      'http://localhost:3000.evil.example',
      'http://localhost:3001',
      'https://localhost:3000',
      'null',
    ]) {
      expect(() => assertSameOrigin(req('DELETE', { origin }), APP)).toThrow();
    }
  });

  it('without Origin, requires same-origin Fetch Metadata', () => {
    expect(() => assertSameOrigin(req('POST', { 'sec-fetch-site': 'same-origin' }), APP)).not.toThrow();
    expect(() => assertSameOrigin(req('POST', { 'sec-fetch-site': 'cross-site' }), APP)).toThrow();
    expect(() => assertSameOrigin(req('POST', { 'sec-fetch-site': 'same-site' }), APP)).toThrow();
  });

  it('fails closed when there is no Origin and no Fetch Metadata', () => {
    expect(() => assertSameOrigin(req('PUT'), APP)).toThrow();
  });
});
