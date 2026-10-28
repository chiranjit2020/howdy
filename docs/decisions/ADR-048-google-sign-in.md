# ADR-048 — Continue with Google

Status: accepted (2026-10-29). Asked for by you: sign-up must be "as quick as possible".

## Decisions taken with you (2026-10-29)

- **Same email = same account, linked automatically.** Google has proved the address. Two-step sign-in is still asked
  for when it is on, exactly as after a password.
- **Someone new gets one short step:** a username (suggested from their Google name, checked live), an optional display
  name (from Google) and the required 18+ / Terms box. No confirmation email: Google verified the address.

## Decisions

1. **OpenID Connect authorization-code flow with PKCE, `state` and `nonce`, no library** (`src/modules/auth/google.ts`).
   The code is exchanged server-to-server over TLS, so the ID token is trusted without checking its signature (OIDC
   Core 3.1.3.7 step 6); `iss`, `aud`, `exp`, `nonce` and `email_verified` are still checked. Scope: `openid email
   profile` only.
2. **No new table.** The link is the verified email (decision above), so a `provider/subject` table would add no
   security. Google's `sub` is not stored.
3. **Google only proves; normal sign-in finishes.** The callback sets a signed, HttpOnly, 10-minute cookie
   (`google-proven`) and sends the browser to `/login?google=continue`, which posts `{ google: true }` to
   `/api/auth/login`. The account id comes only from that cookie, never the body. Two-step, suspension, closing and
   "Remember this device" (chosen before leaving for Google, carried in the flow cookie) all run through the same code
   as a password.
4. **Pre-hijack protection.** If the matching account never confirmed its email, whoever created it did not prove they
   own the address. Before handing it over, its password is deleted and its sessions revoked.
5. **No password until they set one.** Closing the account, downloading data and changing sign-in security re-ask for
   the password; for a Google-made account they say so plainly ("Set one with Forgot password?") instead of "wrong
   password". Forgot password works for them (it emails the verified address and creates the password).
6. **Off unless configured.** `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (both or neither). Without them the button
   is not shown and `/api/auth/google/start` goes back to Log in.
7. Rate limits: Google answers 30 per 15 minutes per source; finishing a Google sign-up shares the sign-up limit.
8. Privacy Policy 1.21.0 names Google as a provider (what it shares: email, verified, name). Not material: nobody is
   asked to agree again.

## Setting it up

Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application.
Authorised redirect URI: `https://howdy.chiranjitkarmakar.com/api/auth/google/callback` (and
`http://localhost:3000/api/auth/google/callback` for development). OAuth consent screen: app name Howdy, support email,
scopes `email`, `profile`, `openid`; publish it (otherwise only test users can sign in). Put the client id and secret in
Vercel as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Production) and redeploy.

Tests: `tests/security/auth-google.test.ts` (Google's token endpoint is mocked).
