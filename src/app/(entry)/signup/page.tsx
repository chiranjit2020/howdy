import { redirect } from 'next/navigation';
import { getCurrentUser, googleEnabled, turnstileSiteKey } from '@/modules/auth';
import { inviterName } from '@/modules/invites';
import { INVITE_CODE_PATTERN } from '@/shared/validation/invites';
import { AuthCard } from '../auth-card';
import { AuthSplit } from '../auth-split';

export const metadata = { title: 'Create account' };

/** `?invite=<code>`: arrived through someone's invite link (ADR-045). A link that does not work is simply ignored. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  if (await getCurrentUser()) redirect('/home');
  const raw = (await searchParams).invite;
  const code = typeof raw === 'string' && INVITE_CODE_PATTERN.test(raw) ? raw : undefined;
  const invitedBy = code ? await inviterName(code) : null;
  return (
    <AuthSplit>
      <AuthCard
        initial="signup"
        google={googleEnabled()}
        turnstileSiteKey={turnstileSiteKey()}
        {...(code && invitedBy ? { invite: { code, invitedBy } } : {})}
      />
    </AuthSplit>
  );
}
