import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { inviterName } from '@/modules/invites';
import { INVITE_CODE_PATTERN } from '@/shared/validation/invites';
import { AuthCard } from '../auth-card';

export const metadata = { title: 'Stake a Claim' };

/** `?invite=<code>`: arrived through someone's invite link (ADR-045). A link that does not work is simply ignored. */
export default async function StakeAClaimPage({
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
      // Centred in the space under the top bar (4rem + its 1px border). No side padding of its own: the shell's px-4
      // already gives the gutter, and doubling it squeezes the card on a 320px phone.
      className="mx-auto flex min-h-[calc(100dvh-4rem-1px)] w-full max-w-md flex-col justify-center py-4"
    >
      <AuthCard initial="stake-a-claim" {...(code && invitedBy ? { invite: { code, invitedBy } } : {})} />
    </main>
  );
}
