import { readJson } from '@/platform/http/body';
import { json, route } from '@/platform/http/route';
import { AppError } from '@/platform/errors';
import {
  appealProofSchema,
  confirmAppSchema,
  deleteAccountSchema,
  emailOnlySchema,
  passkeyRegistrationSchema,
  passkeySignInSchema,
  passwordOnlySchema,
  resetPasswordSchema,
  signInProofSchema,
  signUpSchema,
  verifyEmailSchema,
} from '@/shared/validation/auth';
import { audit } from './audit';
import { requestDeletion } from './deletion';
import {
  appealSuspension,
  forgotPassword,
  keepClosingAccount,
  closeFromSignIn,
  login,
  passkeyLogin,
  resendVerification,
  resetPassword,
  signUp,
  verifyEmail,
} from './accounts';
import {
  clearedSessionCookie,
  requestContext,
  requireSession,
  sessionCookie,
  sessionTokenFrom,
} from './request';
import { addPasskey, passkeyRegistrationOptions, passkeySignInOptions, removePasskey } from './passkeys';
import { listSessions, revokeAllSessions, revokeOwnedSession, revokeSessionByToken } from './sessions';
import { confirmApp, removeApp, renewRecoveryCodes, startApp } from './two-step';

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
    const body = await readJson(req, signInProofSchema);
    const result = await login(body, {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
    });
    return withCookie(json({ user: result.user }), sessionCookie(result.token, result.maxAgeSec));
  }),

  /** A passkey challenge for signing in (ADR-040). No handle is asked for, so nothing here says who has an account. */
  passkeyOptions: route(async ({ req, requestId }) => {
    return json(await passkeySignInOptions(requestContext(req, requestId)));
  }),

  /** Sign in with a passkey's answer: no password and no second step (the passkey is both). */
  passkeyLogin: route(async ({ req, requestId }) => {
    const body = await readJson(req, passkeySignInSchema);
    const result = await passkeyLogin(body, {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
    });
    return withCookie(json({ user: result.user }), sessionCookie(result.token, result.maxAgeSec));
  }),

  /** A suspended person's one appeal, sent with their sign-in ticket or details (they have no session). ADR-023. */
  appeal: route(async ({ req, requestId }) => {
    const body = await readJson(req, appealProofSchema);
    await appealSuspension(body, requestContext(req, requestId));
    return json(ACCEPTED);
  }),

  /** "Keep my account": cancel a scheduled deletion with the sign-in details (there is no session). ADR-027. */
  keep: route(async ({ req, requestId }) => {
    const body = await readJson(req, signInProofSchema);
    await keepClosingAccount(body, requestContext(req, requestId));
    return json(ACCEPTED);
  }),

  /** Close my account from the sign-in page (a suspended person has no session). Same checks as signing in. */
  close: route(async ({ req, requestId }) => {
    const body = await readJson(req, signInProofSchema);
    const { deleteOn } = await closeFromSignIn(body, requestContext(req, requestId));
    return json({ deleteOn: deleteOn.toISOString() });
  }),

  /** Close my account and schedule its deletion (password re-checked). Ends every session, this one included. */
  deleteAccount: route(async ({ req, requestId }) => {
    const { user } = await requireSession(req);
    const { password } = await readJson(req, deleteAccountSchema);
    const { deleteOn } = await requestDeletion(user.id, password, { requestId });
    return withCookie(json({ deleteOn: deleteOn.toISOString() }), clearedSessionCookie());
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

  // ─── two-step sign-in, from the Workshop (ADR-040): every change re-checks the password ─────────────────────────

  passkeyAddOptions: route(async ({ req }) => {
    const { user } = await requireSession(req);
    const { password } = await readJson(req, passwordOnlySchema);
    return json(await passkeyRegistrationOptions(user, password));
  }),

  passkeyAdd: route(async ({ req, requestId }) => {
    const { user, sessionId } = await requireSession(req);
    const body = await readJson(req, passkeyRegistrationSchema);
    const out = await addPasskey(user, sessionId, body, {
      requestId,
      userAgent: req.headers.get('user-agent'),
    });
    return json({ ok: true, ...out });
  }),

  /** Remove one of MY passkeys. Someone else's (or a made-up) id is the same 404. */
  passkeyRemove: route(async ({ req, requestId, params }) => {
    const { user } = await requireSession(req);
    const { id } = await params;
    if (!id || !UUID.test(id)) throw new AppError('NOT_FOUND');
    const { password } = await readJson(req, passwordOnlySchema);
    await removePasskey(user.id, id, password, { requestId });
    return json(ACCEPTED);
  }),

  appStart: route(async ({ req }) => {
    const { user } = await requireSession(req);
    const { password } = await readJson(req, passwordOnlySchema);
    return json(await startApp(user, password));
  }),

  appConfirm: route(async ({ req, requestId }) => {
    const { user, sessionId } = await requireSession(req);
    const { code } = await readJson(req, confirmAppSchema);
    return json({ ok: true, ...(await confirmApp(user.id, sessionId, code, { requestId })) });
  }),

  appRemove: route(async ({ req, requestId }) => {
    const { user } = await requireSession(req);
    const { password } = await readJson(req, passwordOnlySchema);
    await removeApp(user.id, password, { requestId });
    return json(ACCEPTED);
  }),

  recoveryCodes: route(async ({ req, requestId }) => {
    const { user } = await requireSession(req);
    const { password } = await readJson(req, passwordOnlySchema);
    return json({ recoveryCodes: await renewRecoveryCodes(user.id, password, { requestId }) });
  }),
};
