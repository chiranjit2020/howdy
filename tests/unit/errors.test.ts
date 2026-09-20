import { describe, expect, it } from 'vitest';
import { AppError, toPublicError } from '@/platform/errors';

describe('toPublicError', () => {
  it('maps AppError to its status and public message', () => {
    const { status, body } = toPublicError(new AppError('NOT_FOUND'), 'req-1');
    expect(status).toBe(404);
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-1' });
  });

  it('turns unknown errors into a generic 500 without leaking details', () => {
    const leaky = new Error(
      'duplicate key value violates unique constraint "users_email_key" at db.internal:5432',
    );
    const { status, body } = toPublicError(leaky, 'req-2');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/duplicate|users_email_key|db\.internal/);
  });

  it('does not expose the wrapped cause of an AppError', () => {
    const err = new AppError('INTERNAL', { cause: new Error('SELECT * FROM secrets') });
    expect(JSON.stringify(toPublicError(err, 'r').body)).not.toContain('SELECT');
  });

  it('carries retryAfterSec and field errors when provided', () => {
    const out = toPublicError(new AppError('RATE_LIMITED', { retryAfterSec: 30 }), 'r');
    expect(out.retryAfterSec).toBe(30);
    const v = toPublicError(new AppError('VALIDATION_FAILED', { fields: { handle: 'Too short' } }), 'r');
    expect(v.body.error.fields).toEqual({ handle: 'Too short' });
  });
});
