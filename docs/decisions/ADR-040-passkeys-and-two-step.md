# ADR-040 — Passkeys and two-step sign-in

**Context.** Until now a password alone opened an account, and with it Whispers, the data export and (for staff) the
moderation tools. ADR-003 left room for passkeys/MFA ("further factor tables… a vetted WebAuthn library, not
hand-rolled"). Most people use Howdy on a phone in India; SMS codes cost money per message and are the weakest second
step, so they are out.

**Decisions (the user's, 2026-10-05).**
1. **Both passkeys and an authenticator app (TOTP).** Passkeys for phones and browsers that have them; app codes for
   everyone else.
2. **A passkey signs in on its own** ("Sign in with a passkey": no handle, no password). It proves the device and the
   fingerprint/face/screen lock, and cannot be phished, so it is both factors. The password keeps working as before.
3. **Optional for members, required for staff.** Moderators and admins cannot use moderation until two-step is on.
4. **Recovery = 10 one-time codes; a password reset does NOT turn two-step off.** Whoever gets into the mailbox still
   needs the second step. Lose every factor and every code and the account cannot be recovered — the UI says so.

## How it works

- **"On"** = a confirmed authenticator app OR at least one passkey. Then a password sign-in also needs an app code, an
  unused recovery code, or a passkey (the UI offers "Use a passkey instead"). The first factor added issues the
  recovery codes and **signs out every other device**; removing the last one deletes the codes.
- **The second step is asked only after the password is proven** (`SECOND_STEP_REQUIRED`, 401, with which factors
  exist), and *before* anything about the account's status (suspended, closing, unconfirmed) is said. A wrong password
  gives the same answer as an unknown account, code or no code.
- **App codes**: RFC 6238 (SHA-1, 6 digits, 30 s, ±1 step), hand-written in `totp.ts` (≈60 lines, checked against the
  RFC's own vectors). The secret is stored AES-256-GCM-sealed under a key derived from `AUTH_SECRET` (HKDF, own label),
  bound to the account id. A code is accepted at most once: the matched step is written with a compare-and-set
  (`last_step < step`), so a replayed or raced code loses. 5 code attempts per account per 15 min, spent before the check
  (on top of the password limits): a guesser needs years.
- **Recovery codes**: 10 × 10 characters of an unambiguous alphabet (~49 bits each), stored as HMAC-SHA256 under a
  derived key (a plain hash of 49 bits could be brute-forced from a leaked database), claimed atomically.
- **Passkeys** via `@simplewebauthn/server` 14: relying party = the site's own host name, origin must be the site's own
  origin (that is the phishing protection), user verification REQUIRED, discoverable credentials, attestation `none`,
  ES256/EdDSA/RS256 pinned. Only the public key is stored. Challenges live in `webauthn_challenges`, are single use
  (`DELETE … RETURNING`), expire after 5 minutes, and an add-challenge is bound to the account that asked. A device-bound
  key whose counter does not move forward is refused (clone detection; synced passkeys always say 0). At most 10 per
  account. The sign-in options carry no allow-list, so asking for them says nothing about who has an account.
- **Every change re-asks the password** (add/remove a passkey, link/unlink the app, new recovery codes; 10 per hour per
  account) and **emails the owner** (no codes or keys in the mail). A stolen open session must not be enough to plant the
  thief's own passkey.
- **Sign-in tickets.** After a *complete* sign-in that cannot open a session (suspended, closing), the error carries a
  15-minute HMAC ticket. The sign-in page uses it to appeal, keep or close the account, and to sign in after keeping it —
  instead of re-sending the password and a code (an app code works only once). The password routes for appeal/keep/close
  still work, and now need the second step too: closing an account from the sign-in page is not a way around two-step.
- **Staff gate** lives in moderation's own `requireModerator` (one choke point every moderation route already passes).
  Moderation may not import auth, so it asks the same question in SQL; a test checks the two answers agree for every kind
  of factor. Staff without two-step get a 403 that says what to do (members still get the 404); the page links to the
  Workshop. `pnpm set-role` warns when it promotes someone who has no second step yet.

## Alternatives considered
- **SMS / email codes**: cost per message (SMS), SIM-swap risk, and an email code is no second factor when the reset
  link goes to the same inbox.
- **Passkey only as a second step after the password**: no security gain over a passkey alone, and slower.
- **A password reset also turns two-step off**: easier for someone who loses everything, but then the mailbox is the
  only thing protecting the account. The user chose the stricter rule.
- **A TOTP library** (`otpauth`): the algorithm is small and fully specified; owning it means one fewer dependency on
  the sign-in path. WebAuthn, by contrast, is large and subtle, so it uses the vetted library.
- **Storing session strength** (`sessions.auth_method`) for the staff gate: unnecessary once turning two-step on signs
  out every other device — every live session of a staff member with two-step then passed it.

## Consequences
- Migration `0032_two_step` (`passkeys`, `totp_factors`, `recovery_codes`, `webauthn_challenges`; all cascade on account
  deletion). No new environment variables (keys derive from `AUTH_SECRET` — rotating it invalidates linked apps, recovery
  codes and tickets, so do not rotate it casually).
- The daily purge removes expired challenges and unfinished app setups. The data export lists what is set up, never a
  secret. Privacy Policy 1.11.0 (no re-acceptance).
- **The team account (`rickdev`, admin) must turn two-step on before moderation opens again in production.**
- Known limits: no passkey autofill ("conditional UI") yet; passkeys cannot be renamed; re-checking the password for
  security changes is a password, not a passkey, prompt.
