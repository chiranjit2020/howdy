import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { AppError } from '@/platform/errors';
import {
  emailOnlySchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@/shared/validation/auth';
import { audit } from './audit';
import { forgotPassword, login, resendVerification, resetPassword, signUp, verifyEmail } from './accounts';
import {
  clearedSessionCookie,
  requestContext,
  requireSession,
  sessionCookie,
  sessionTokenFrom,
} from './request';
import { listSessions, revokeAllSessions, revokeOwnedSession, revokeSessionByToken } from './sessions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uniform "we did it (if it applies)" body for endpoints that must not reveal whether an account exists. */
const ACCEPTED = { ok: true } as const;
const withCookie = (res: Response, cookie: string): Response => {
  res.headers.append('Set-Cookie', cookie);
  return res;
};

/**
 * HTTP handlers for /api/auth/*. Each is a thin adapter: validate input → call the use case → shape the response.
 * All are wrapped by `route()` (request id, CSRF origin check, safe errors, logging).
 */
export const authHandlers = {
  signup: route(async ({ req, requestId }) => {
    const body = await readJson(req, signUpSchema);
    await signUp(body, requestContext(req, requestId));
    return json(ACCEPTED, { status: 202 });
  }),

  login: route(async ({ req, requestId }) => {
    const body = await readJson(req, loginSchema);
    const result = await login(body, {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
    });
    return withCookie(json({ user: result.user }), sessionCookie(result.token, result.maxAgeSec));
  }),

  /** Idempotent: always clears the cookie, whether or not a live session was presented. */
  logout: route(async ({ req, requestId }) => {
    const token = sessionTokenFrom(req.headers);
    if (token && (await revokeSessionByToken(token))) await audit('logout', { requestId });
    return withCookie(json(ACCEPTED), clearedSessionCookie());
  }),

  logoutAll: route(async ({ req, requestId }) => {
    const { user } = await requireSession(req);
    const count = await revokeAllSessions(user.id);
    await audit('logout_all', { userId: user.id, requestId, meta: { count } });
    return withCookie(json(ACCEPTED), clearedSessionCookie());
  }),

  me: route(async ({ req }) => {
    const { user } = await requireSession(req);
    return json({
      user: {
        id: user.id,
        email: user.email,
        handle: user.handle,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    });
  }),

  verifyEmail: route(async ({ req, requestId }) => {
    const { token } = await readJson(req, verifyEmailSchema);
    await verifyEmail(token, requestContext(req, requestId));
    return json(ACCEPTED);
  }),

  resendVerification: route(async ({ req, requestId }) => {
    const { email } = await readJson(req, emailOnlySchema);
    await resendVerification(email, requestContext(req, requestId));
    return json(ACCEPTED, { status: 202 });
  }),

  forgotPassword: route(async ({ req, requestId }) => {
    const { email } = await readJson(req, emailOnlySchema);
    await forgotPassword(email, requestContext(req, requestId));
    return json(ACCEPTED, { status: 202 });
  }),

  resetPassword: route(async ({ req, requestId }) => {
    const body = await readJson(req, resetPasswordSchema);
    await resetPassword(body, requestContext(req, requestId));
    return json(ACCEPTED);
  }),

  listSessions: route(async ({ req }) => {
    const { user, sessionId } = await requireSession(req);
    return json({ sessions: await listSessions(user.id, sessionId) });
  }),

  /** Revoke one of MY sessions. Someone else's (or a non-existent) id gets the same 404: no probing. */
  revokeSession: route(async ({ req, requestId, params }) => {
    const { user, sessionId: currentId } = await requireSession(req);
    const { id } = await params;
    if (!id || !UUID.test(id)) throw new AppError('NOT_FOUND');
    if (!(await revokeOwnedSession(user.id, id))) throw new AppError('NOT_FOUND');
    await audit('session_revoked', { userId: user.id, requestId });
    const res = json(ACCEPTED);
    return id === currentId ? withCookie(res, clearedSessionCookie()) : res;
  }),
};
