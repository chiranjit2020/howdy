import { listMySessions, requireUser, twoStepSummary } from '@/modules/auth';
import { recheckTrust } from '@/modules/trust';
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
export default async function AccountSettingsPage() {
  const user = await requireUser();
  const [security, sessions, trust] = await Promise.all([
    twoStepSummary(user.id),
    listMySessions(),
    // Checking also refreshes the stored tick.
    recheckTrust(user.id),
  ]);
  return (
    <>
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
      <ExportData />
      <DeleteAccount />
    </>
  );
}
