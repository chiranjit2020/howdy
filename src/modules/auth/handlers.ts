import { z } from 'zod';
import { getEnv } from '@/platform/config/env';
import { readJson } from '@/platform/http/body';
import { parseCookies } from '@/platform/http/cookies';
import { json, route } from '@/platform/http/route';
import { AppError } from '@/platform/errors';
import { INVITE_CODE_PATTERN } from '@/shared/validation/invites';
import { displayNameSchema } from '@/shared/validation/profile';
import {
  appealProofSchema,
  confirmAppSchema,
  deleteAccountSchema,
  emailOnlySchema,
  googleSignInSchema,
  googleSignUpSchema,
  handleCheckSchema,
  passkeyRegistrationSchema,
  passkeySignInSchema,
  passwordOnlySchema,
  resetPasswordSchema,
  signInProofSchema,
  signUpSchema,
  verifyEmailCodeSchema,
  verifyEmailSchema,
} from '@/shared/validation/auth';
import { audit } from './audit';
import { requestDeletion } from './deletion';
import {
  appealSuspension,
  forgotPassword,
  keepClosingAccount,
  closeFromSignIn,
  handleAvailable,
  login,
  passkeyLogin,
  resendVerification,
  resetPassword,
  signUp,
  signUpWithGoogle,
  verifyEmail,
  verifyEmailCode,
} from './accounts';
import {
  clearedGoogleCookie,
  finishGoogle,
  googleEnabled,
  googleSignupCookieName,
  pendingGoogleSignup,
  provenByGoogle,
  startGoogle,
} from './google';
import {
  clearedSessionCookie,
  requestContext,
  requireSession,
  sessionCookie,
  sessionTokenFrom,
} from './request';
import { addPasskey, passkeyRegistrationOptions, passkeySignInOptions, removePasskey } from './passkeys';
import {
  createSession,
  listSessions,
  revokeAllSessions,
  revokeOwnedSession,
  revokeSessionByToken,
} from './sessions';
import { confirmApp, removeApp, renewRecoveryCodes, startApp } from './two-step';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A browser redirect (the Google round trip is page loads, not fetches). Relative targets stay on our own site. */
function redirectTo(to: string, cookies: string[] = []): Response {
  const location = to.startsWith('https://') ? to : new URL(to, getEnv().APP_URL).toString();
  const res = new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
  for (const c of cookies) res.headers.append('Set-Cookie', c);
  return res;
}

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

  /** Live "is this username free?" for Create account. Only usernames, never emails (those stay unenumerable). */
  handleAvailable: route(async ({ req, requestId }) => {
    const { handle } = await readJson(req, handleCheckSchema);
    return json({ available: await handleAvailable(handle, requestContext(req, requestId)) });
  }),

  login: route(async ({ req, requestId }) => {
    const body = await readJson(req, z.union([googleSignInSchema, signInProofSchema]));
    const base = {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
    };
    if ('google' in body) {
      // ADR-048: Google already proved the account; the proof is the cookie the callback set, never the body.
      const proven = provenByGoogle(req.headers.get('cookie'));
      if (!proven)
        throw new AppError('UNAUTHENTICATED', { message: 'That took too long. Try Google again.' });
      const result = await login(
        { googleUserId: proven.userId, code: body.code },
        { ...base, remember: proven.remember },
      );
      const res = withCookie(json({ user: result.user }), sessionCookie(result.token, result.maxAgeSec));
      return withCookie(res, clearedGoogleCookie('proven'));
    }
    const { remember, ...proof } = body;
    const result = await login(proof, { ...base, remember });
    return withCookie(json({ user: result.user }), sessionCookie(result.token, result.maxAgeSec));
  }),

  /** "Continue with Google" (ADR-048): off to Google, remembering what we asked in a short signed cookie. */
  googleStart: route(async ({ req }) => {
    if (!googleEnabled()) return redirectTo('/login');
    const params = new URL(req.url).searchParams;
    const invite = params.get('invite');
    const { location, setCookie } = startGoogle({
      remember: params.get('remember') !== '0',
      invite: invite && INVITE_CODE_PATTERN.test(invite) ? invite : null,
    });
    return redirectTo(location, [setCookie]);
  }),

  /**
   * Google's answer. Anything off sends the person back to Log in with a short message (this is a page load, not a
   * fetch: an error must never be a page of JSON). An existing account finishes on Log in (two-step, suspension …);
   * a new person picks a username first.
   */
  googleCallback: route(async ({ req, requestId }) => {
    const done = [clearedGoogleCookie('flow')];
    if (new URL(req.url).searchParams.get('error') === 'access_denied') {
      return redirectTo('/login?google=cancelled', done);
    }
    try {
      const outcome = await finishGoogle(req, requestContext(req, requestId));
      return outcome.kind === 'existing'
        ? redirectTo('/login?google=continue', [...done, outcome.setCookie])
        : redirectTo('/signup/google', [...done, outcome.setCookie]);
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'INTERNAL';
      return redirectTo(`/login?google=${code === 'RATE_LIMITED' ? 'busy' : 'failed'}`, done);
    }
  }),

  /** The last step for someone new from Google: username + the required box, then they are in. */
  googleComplete: route(async ({ req, requestId }) => {
    const body = await readJson(req, googleSignUpSchema);
    const pending = pendingGoogleSignup(
      parseCookies(req.headers.get('cookie')).get(googleSignupCookieName()),
    );
    if (!pending) {
      throw new AppError('UNAUTHENTICATED', { message: 'That took too long. Start again with Google.' });
    }
    const ctx = requestContext(req, requestId);
    // The form no longer asks for a display name: use the one Google gave, screened like a typed one (or none, and
    // the profile is named after the username).
    const fromGoogle = pending.name ? displayNameSchema.safeParse(pending.name) : null;
    const { userId } = await signUpWithGoogle(
      {
        email: pending.email,
        handle: body.handle,
        displayName: body.displayName ?? (fromGoogle?.success ? fromGoogle.data : undefined),
        invite: pending.invite ?? undefined,
      },
      ctx,
    );
    const previous = sessionTokenFrom(req.headers);
    if (previous) await revokeSessionByToken(previous);
    const session = await createSession(userId, req.headers.get('user-agent'));
    await audit('login_success', { userId, requestId, meta: { method: 'google' } });
    const res = withCookie(json({ ok: true }), sessionCookie(session.token, session.maxAgeSec));
    return withCookie(res, clearedGoogleCookie('signup'));
  }),

  /** A passkey challenge for signing in (ADR-040). No handle is asked for, so nothing here says who has an account. */
  passkeyOptions: route(async ({ req, requestId }) => {
    return json(await passkeySignInOptions(requestContext(req, requestId)));
  }),

  /** Sign in with a passkey's answer: no password and no second step (the passkey is both). */
  passkeyLogin: route(async ({ req, requestId }) => {
    const { remember, ...answer } = await readJson(req, passkeySignInSchema);
    const result = await passkeyLogin(answer, {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
      remember,
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

  /** The 6-digit code typed on the sign-up page: confirms the email and, as a rule, signs straight in. */
  verifyEmailCode: route(async ({ req, requestId }) => {
    const body = await readJson(req, verifyEmailCodeSchema);
    const result = await verifyEmailCode(body, {
      ...requestContext(req, requestId),
      userAgent: req.headers.get('user-agent'),
      previousToken: sessionTokenFrom(req.headers),
    });
    if (!result) return json({ signedIn: false });
    return withCookie(
      json({ signedIn: true, user: result.user }),
      sessionCookie(result.token, result.maxAgeSec),
    );
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
