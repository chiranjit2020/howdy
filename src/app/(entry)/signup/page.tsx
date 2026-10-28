import { redirect } from 'next/navigation';
import { getCurrentUser, googleEnabled } from '@/modules/auth';
import { inviterName } from '@/modules/invites';
import { INVITE_CODE_PATTERN } from '@/shared/validation/invites';
import { AuthCard } from '../auth-card';

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
    <main
      id="main"
      // Centred on the screen (these pages have no top bar). No side padding of its own: the shell's px-4
      // already gives the gutter, and doubling it squeezes the card on a 320px phone.
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-4"
    >
      <AuthCard
        initial="signup"
        google={googleEnabled()}
        {...(code && invitedBy ? { invite: { code, invitedBy } } : {})}
      />
    </main>
  );
}
