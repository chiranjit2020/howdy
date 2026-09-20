import { describe, expect, it } from 'vitest';
import { AppError } from '@/platform/errors';
import { json, route } from '@/platform/http/route';

const post = (headers: Record<string, string> = { origin: 'http://localhost:3000' }) =>
  new Request('http://localhost:3000/api/x', { method: 'POST', headers });

describe('route wrapper', () => {
  it('returns handler output with a request id and no-store caching', async () => {
    const res = await route(async () => json({ ok: true }))(post());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects cross-origin state-changing requests before the handler runs', async () => {
    let ran = false;
    const res = await route(async () => {
      ran = true;
      return json({});
    })(post({ origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(ran).toBe(false);
  });

  it('maps unexpected errors to a generic 500 that leaks nothing', async () => {
    const res = await route(async () => {
      throw new Error('relation "users" does not exist; password=hunter2');
    })(post());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/relation|users|hunter2/);
    expect(JSON.parse(text).error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('sets Retry-After on RATE_LIMITED', async () => {
    const res = await route(async () => {
      throw new AppError('RATE_LIMITED', { retryAfterSec: 42 });
    })(post());
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
  });

  it('ignores a malformed client-supplied request id', async () => {
    const res = await route(async () => json({}))(
      new Request('http://localhost:3000/api/x', {
        method: 'GET',
        headers: { 'x-request-id': 'evil-id <script>alert(1)</script>' },
      }),
    );
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('keeps a well-formed request id set upstream', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    const res = await route(async () => json({}))(
      new Request('http://localhost:3000/api/x', { method: 'GET', headers: { 'x-request-id': id } }),
    );
    expect(res.headers.get('x-request-id')).toBe(id);
  });
});
