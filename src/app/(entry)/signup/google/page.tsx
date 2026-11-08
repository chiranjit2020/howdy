import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, googleSignupCookieName, pendingGoogleSignup } from '@/modules/auth';
import { EntryCard } from '@/ui/auth/entry-shell';
import { handleFromText } from '../handle-suggest';
import { GoogleFinishForm } from './google-finish-form';

export const metadata = { title: 'Create account' };

/**
 * The one step after Google for someone new (ADR-048): Google gave a verified email, so all that is left is a username
 * and the required box. Only reachable with the signed cookie Google's answer set; without it, back to Sign up.
 */
export default async function GoogleSignupPage() {
  if (await getCurrentUser()) redirect('/home');
  const pending = pendingGoogleSignup((await cookies()).get(googleSignupCookieName())?.value);
  if (!pending) redirect('/signup');
  const suggested = handleFromText(pending.name ?? '') || handleFromText(pending.email.split('@')[0] ?? '');
  return (
    <EntryCard>
      <GoogleFinishForm email={pending.email} suggested={suggested} />
    </EntryCard>
  );
}
