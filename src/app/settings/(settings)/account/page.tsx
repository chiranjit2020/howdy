import { identityCheckFor, listMySessions, requireUser, twoStepSummary } from '@/modules/auth';
import { recheckTrust } from '@/modules/trust';
import { FormMessage } from '@/ui/auth/form-parts';
import { Devices } from '@/ui/shell/devices';
import { DeleteAccount } from '../delete-account';
import { ExportData } from '../export-data';
import { SignInSecurity } from '../sign-in-security';
import { TrustCard } from '../trust-card';

export const metadata = { title: 'Account settings' };

/**
 * Settings › Account: the Trusted tick's checklist (ADR-052), sign-in security, your devices, your data and closing the
 * account. The avatar menu's "Devices" and the moderation pages link straight to their cards (#devices,
 * #sign-in-security).
 */
/** How a "confirm it's you with Google" round trip went (the callback adds ?google=…). */
const GOOGLE_OUTCOME: Record<string, { tone: 'success' | 'error'; text: string }> = {
  confirmed: {
    tone: 'success',
    text: 'Confirmed with Google. You can go ahead now (this lasts 10 minutes).',
  },
  cancelled: { tone: 'error', text: 'Google sign-in was cancelled, so nothing was confirmed.' },
  'other-account': {
    tone: 'error',
    text: 'That was a different Google account. Confirm with the Google account you use for Howdy.',
  },
  busy: { tone: 'error', text: 'Too many tries just now. Wait a few minutes and try again.' },
  failed: { tone: 'error', text: 'Google could not confirm it was you. Please try again.' },
  'use-email': { tone: 'error', text: 'Google could not confirm it was you. Please try again.' },
};

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string | string[] }>;
}) {
  const user = await requireUser();
  const [security, sessions, trust, identity, { google }] = await Promise.all([
    twoStepSummary(user.id),
    listMySessions(),
    // Checking also refreshes the stored tick.
    recheckTrust(user.id),
    identityCheckFor(),
    searchParams,
  ]);
  const outcome = typeof google === 'string' ? GOOGLE_OUTCOME[google] : undefined;
  return (
    <>
      {outcome && (
        <div role="status">
          <FormMessage tone={outcome.tone}>{outcome.text}</FormMessage>
        </div>
      )}
      {trust && !trust.team && <TrustCard status={trust} />}
      <SignInSecurity
        view={{
          ...security,
          passkeys: security.passkeys.map((p) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
          })),
        }}
        identity={identity}
      />
      <div id="devices" className="scroll-mt-20">
        <Devices
          initial={sessions.map((s) => ({
            id: s.id,
            deviceLabel: s.deviceLabel,
            createdAt: s.createdAt.toISOString(),
            lastSeenAt: s.lastSeenAt.toISOString(),
            current: s.current,
          }))}
        />
      </div>
      <ExportData identity={identity} />
      <DeleteAccount identity={identity} />
    </>
  );
}
