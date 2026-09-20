/**
 * Consistent error model. Only `code` and `message` ever reach the client; `cause` and `details`
 * are for logs. Public messages must be safe (no SQL, stack traces, account existence, infra info).
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CSRF_REJECTED'
  /** Correct credentials but the email is not confirmed yet. Only ever returned AFTER the password was verified. */
  | 'EMAIL_NOT_VERIFIED'
  /** Correct credentials but the account cannot be used (suspended, pending deletion). Also post-password only. */
  | 'ACCOUNT_UNAVAILABLE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_UNAVAILABLE: 403,
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CSRF_REJECTED: 403,
  INTERNAL: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  EMAIL_NOT_VERIFIED: 'Confirm your email first. We can send the link again.',
  ACCOUNT_UNAVAILABLE: 'This account is not available right now.',
  BAD_REQUEST: 'That request was not understood.',
  VALIDATION_FAILED: 'Some fields need another look.',
  UNAUTHENTICATED: 'You need to step inside first.',
  FORBIDDEN: 'You are not allowed to do that.',
  NOT_FOUND: 'We could not find that.',
  CONFLICT: 'That conflicts with the current state.',
  RATE_LIMITED: 'Slow down a little and try again shortly.',
  CSRF_REJECTED: 'That request was rejected.',
  INTERNAL: 'Something went wrong on our side.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Safe to send to the client. */
  readonly publicMessage: string;
  /** Safe field-level validation info, e.g. { handle: 'Too short' }. */
  readonly fields: Record<string, string> | undefined;
  /** Seconds, for RATE_LIMITED. */
  readonly retryAfterSec: number | undefined;

  constructor(
    code: ErrorCode,
    opts: {
      message?: string;
      fields?: Record<string, string>;
      retryAfterSec?: number;
      cause?: unknown;
    } = {},
  ) {
    super(
      opts.message ?? DEFAULT_MESSAGE[code],
      opts.cause === undefined ? undefined : { cause: opts.cause },
    );
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.publicMessage = opts.message ?? DEFAULT_MESSAGE[code];
    this.fields = opts.fields;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export interface PublicErrorBody {
  error: { code: ErrorCode; message: string; requestId: string; fields?: Record<string, string> };
}

/** Convert anything thrown into a safe response body + status. Unknown errors become a generic INTERNAL. */
export function toPublicError(
  err: unknown,
  requestId: string,
): { status: number; body: PublicErrorBody; retryAfterSec?: number } {
  const appErr = err instanceof AppError ? err : new AppError('INTERNAL', { cause: err });
  const error: PublicErrorBody['error'] = { code: appErr.code, message: appErr.publicMessage, requestId };
  if (appErr.fields) error.fields = appErr.fields;
  const out: { status: number; body: PublicErrorBody; retryAfterSec?: number } = {
    status: appErr.status,
    body: { error },
  };
  if (appErr.retryAfterSec !== undefined) out.retryAfterSec = appErr.retryAfterSec;
  return out;
}
