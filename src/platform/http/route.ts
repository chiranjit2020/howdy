import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { getEnv } from '../config/env';
import { toPublicError } from '../errors';
import { logger } from '../logger';
import { assertSameOrigin } from './csrf';

export interface RouteContext {
  req: Request;
  requestId: string;
  log: Logger;
  /** Dynamic segments (Next 16 delivers them as a promise). Empty for static routes. */
  params: Promise<Record<string, string>>;
}

/** Second argument Next passes to route handlers. */
export interface NextRouteArg {
  params?: Promise<Record<string, string | string[]>>;
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Standard JSON response: never cached, request id always echoed. */
export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'no-store');
  return Response.json(data, { status: init.status ?? 200, headers });
}

/**
 * Wrap a route handler with request id, CSRF guard, structured logging and safe error mapping.
 * Handlers return a Response (use `json`) or throw AppError; everything else becomes a generic 500.
 */
export function route(
  handler: (ctx: RouteContext) => Promise<Response>,
): (req: Request, arg?: NextRouteArg) => Promise<Response> {
  return async (req, arg) => {
    const started = performance.now();
    const incoming = req.headers.get('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const log = logger.child({ requestId, method: req.method, path: new URL(req.url).pathname });

    try {
      assertSameOrigin(req, getEnv().APP_URL);
      const params = (arg?.params ?? Promise.resolve({})) as Promise<Record<string, string>>;
      const res = await handler({ req, requestId, log, params });
      res.headers.set('X-Request-Id', requestId);
      log.info({
        event: 'http.request',
        status: res.status,
        durationMs: Math.round(performance.now() - started),
      });
      return res;
    } catch (err) {
      const { status, body, retryAfterSec } = toPublicError(err, requestId);
      const level = status >= 500 ? 'error' : 'warn';
      log[level]({
        event: 'http.error',
        status,
        code: body.error.code,
        errorClass: err instanceof Error ? err.name : typeof err,
        durationMs: Math.round(performance.now() - started),
        // full detail stays in logs only
        err: status >= 500 ? err : undefined,
      });
      const headers: Record<string, string> = { 'X-Request-Id': requestId };
      if (retryAfterSec !== undefined) headers['Retry-After'] = String(retryAfterSec);
      return json(body, { status, headers });
    }
  };
}
