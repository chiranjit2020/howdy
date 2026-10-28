'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest, postJson, type ApiResult } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import {
  makePasskey,
  usePasskeysSupported,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@/ui/auth/passkey';
import { Badge, Button, ClayCard, Input } from '@/ui/primitives';

export interface SecurityView {
  on: boolean;
  app: boolean;
  passkeys: { id: string; name: string; backedUp: boolean; createdAt: string; lastUsedAt: string | null }[];
  recoveryCodesLeft: number;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** An action that needs the password typed again before it runs (ADR-040). Returns an error message, or nothing. */
interface Pending {
  title: string;
  confirm: string;
  danger?: boolean;
  run: (password: string) => Promise<string | undefined>;
}

interface AppSetup {
  secret: string;
  uri: string;
  qr: string;
}

const failed = (res: ApiResult) =>
  res.error?.fields?.password ??
  res.error?.fields?.code ??
  res.error?.message ??
  'That did not work. Try again.';

/**
 * "Sign-in security" (ADR-040): passkeys, an authenticator app, and recovery codes. Two-step is on while there is an app
 * or a passkey. Every change asks for the password again, and the person is emailed about it.
 */
export function SignInSecurity({ view }: { view: SecurityView }) {
  const router = useRouter();
  const canPasskey = usePasskeysSupported();
  const [pending, setPending] = useState<Pending | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [setup, setSetup] = useState<AppSetup | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  function ask(p: Pending) {
    setPending(p);
    setPassword('');
    setError(undefined);
    setNotice(undefined);
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(undefined);
    const problem = await pending.run(password);
    setBusy(false);
    if (problem) return setError(problem);
    setPending(null);
    setPassword('');
    router.refresh();
  }

  /** New recovery codes arrive only when two-step was just turned on, or on request: show them once. */
  function reveal(next: string[] | undefined) {
    if (next?.length) {
      setCodes(next);
      setCopied(false);
    }
  }

  const addPasskey = () =>
    ask({
      title: 'Add a passkey',
      confirm: 'Continue',
      run: async (pw) => {
        const start = await postJson<{
          challengeId: string;
          options: PublicKeyCredentialCreationOptionsJSON;
        }>('/api/me/two-step/passkeys/options', { password: pw });
        if (!start.ok || !start.data) return failed(start);
        const made = await makePasskey(start.data.options);
        if (!made.ok) return made.message;
        const res = await postJson<{ recoveryCodes?: string[] }>('/api/me/two-step/passkeys', {
          challengeId: start.data.challengeId,
          response: made.response,
        });
        if (!res.ok) return failed(res);
        setNotice('Passkey added. Next time, choose “Sign in with a passkey”.');
        reveal(res.data?.recoveryCodes);
        return undefined;
      },
    });

  const removePasskey = (id: string, name: string) =>
    ask({
      title: `Remove the passkey from ${name}`,
      confirm: 'Remove passkey',
      danger: true,
      run: async (pw) => {
        const res = await apiRequest('DELETE', `/api/me/two-step/passkeys/${id}`, { password: pw });
        if (!res.ok) return failed(res);
        setNotice('Passkey removed.');
        return undefined;
      },
    });

  const linkApp = () =>
    ask({
      title: 'Link an authenticator app',
      confirm: 'Continue',
      run: async (pw) => {
        const res = await postJson<AppSetup>('/api/me/two-step/app', { password: pw });
        if (!res.ok || !res.data) return failed(res);
        setSetup(res.data);
        setCode('');
        setCodeError(undefined);
        return undefined;
      },
    });

  async function confirmApp(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setCodeError('Enter the 6-digit code from the app.');
    setBusy(true);
    setCodeError(undefined);
    const res = await postJson<{ recoveryCodes?: string[] }>('/api/me/two-step/app/confirm', {
      code: code.trim(),
    });
    setBusy(false);
    if (!res.ok) return setCodeError(failed(res));
    setSetup(null);
    setNotice('Authenticator app linked.');
    reveal(res.data?.recoveryCodes);
    router.refresh();
  }

  const unlinkApp = () =>
    ask({
      title: 'Unlink the authenticator app',
      confirm: 'Unlink app',
      danger: true,
      run: async (pw) => {
        const res = await apiRequest('DELETE', '/api/me/two-step/app', { password: pw });
        if (!res.ok) return failed(res);
        setNotice('Authenticator app unlinked.');
        return undefined;
      },
    });

  const renewCodes = () =>
    ask({
      title: 'Make new recovery codes (the old ones stop working)',
      confirm: 'Make new codes',
      run: async (pw) => {
        const res = await postJson<{ recoveryCodes: string[] }>('/api/me/two-step/recovery-codes', {
          password: pw,
        });
        if (!res.ok || !res.data) return failed(res);
        reveal(res.data.recoveryCodes);
        return undefined;
      },
    });

  async function copyCodes() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function downloadCodes() {
    if (!codes) return;
    const text = ['Howdy recovery codes — each works once.', '', ...codes, ''].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'howdy-recovery-codes.txt';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <ClayCard className="flex flex-col gap-4" id="sign-in-security">
      <div className="flex flex-col gap-1">
        <h2 className="text-title text-text-primary">Sign-in security</h2>
        <p className="text-caption text-text-secondary">
          {view.on
            ? 'Two-step sign-in is on: your password alone is not enough to get in.'
            : 'Two-step sign-in is off. Add a passkey or an authenticator app so a stolen password is not enough.'}
        </p>
      </div>

      {notice && <FormMessage tone="success">{notice}</FormMessage>}

      {codes && (
        <section
          aria-labelledby="recovery-codes-heading"
          className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
        >
          <h3 id="recovery-codes-heading" className="text-body font-semibold text-text-primary">
            Your recovery codes
          </h3>
          <p className="text-caption text-text-primary">
            Save these somewhere safe, away from your phone. Each one signs you in once if you lose your
            passkey or app. You will not see them again — and without them, a lost phone means a lost account.
          </p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-body text-text-primary">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={copyCodes}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="secondary" onClick={downloadCodes}>
              Download
            </Button>
            <Button variant="ghost" onClick={() => setCodes(null)}>
              I’ve saved them
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="passkeys-heading" className="flex flex-col gap-2">
        <h3 id="passkeys-heading" className="text-body font-semibold text-text-primary">
          Passkeys
        </h3>
        <p className="text-caption text-text-secondary">
          Sign in with your fingerprint, face or screen lock instead of a password. A passkey can’t be phished
          or guessed.
        </p>
        {view.passkeys.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {view.passkeys.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-body text-text-primary">
                    {p.name}
                    {p.backedUp && <Badge>Synced</Badge>}
                  </span>
                  <span className="text-caption text-text-secondary">
                    Added {day(p.createdAt)}
                    {p.lastUsedAt ? ` · last used ${day(p.lastUsedAt)}` : ' · not used yet'}
                  </span>
                </div>
                <Button variant="ghost" onClick={() => removePasskey(p.id, p.name)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {canPasskey ? (
          <Button variant="secondary" className="self-start" onClick={addPasskey}>
            Add a passkey
          </Button>
        ) : (
          <p className="text-caption text-text-secondary">This browser can’t make passkeys.</p>
        )}
      </section>

      <section aria-labelledby="app-heading" className="flex flex-col gap-2">
        <h3 id="app-heading" className="text-body font-semibold text-text-primary">
          Authenticator app
        </h3>
        <p className="text-caption text-text-secondary">
          A 6-digit code from an app such as Google Authenticator, asked for after your password.
        </p>
        {view.app ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-body text-text-primary">Linked</span>
            <Button variant="ghost" onClick={unlinkApp}>
              Unlink
            </Button>
          </div>
        ) : setup ? (
          <form
            onSubmit={confirmApp}
            noValidate
            className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
          >
            <p className="text-caption text-text-primary">
              On this phone, open the link below. On a computer, scan the code with your phone. Or type the
              key into the app yourself.
            </p>
            <a href={setup.uri} className="inline-flex min-h-11 items-center self-start">
              Open in authenticator app
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made on the server, not a file to optimise */}
            <img
              src={setup.qr}
              alt="QR code for linking an authenticator app"
              width={180}
              height={180}
              className="rounded-sm bg-surface"
            />
            <p className="text-caption text-text-secondary">
              Key: <span className="font-mono break-all text-text-primary">{setup.secret}</span>
            </p>
            <Input
              label="Code from the app"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={codeError}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy}>
                Link app
              </Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" className="self-start" onClick={linkApp}>
            Link an app
          </Button>
        )}
      </section>

      {view.on && (
        <section aria-labelledby="recovery-heading" className="flex flex-col gap-2">
          <h3 id="recovery-heading" className="text-body font-semibold text-text-primary">
            Recovery codes
          </h3>
          <p className="text-caption text-text-secondary">
            {view.recoveryCodesLeft} of 10 left. A password reset by email does not switch two-step off, so
            these are your way back in.
          </p>
          <Button variant="secondary" className="self-start" onClick={renewCodes}>
            Make new codes
          </Button>
        </section>
      )}

      {pending && (
        <form
          onSubmit={confirm}
          noValidate
          aria-label={pending.title}
          className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4"
        >
          <p className="text-body font-semibold text-text-primary">{pending.title}</p>
          <Input
            label="Your password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={pending.danger ? 'danger' : 'primary'} loading={busy}>
              {pending.confirm}
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </ClayCard>
  );
}
