import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser, googleSignupCookieName, pendingGoogleSignup } from '@/modules/auth';
import { Card } from '@/ui/primitives';
import { EntryFooter, EntryLogo } from '../../auth-card';
import { handleFromText } from '../signup-aids';
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
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-4">
      <Card className="flex flex-col gap-5 p-5 shadow-clay sm:p-7">
        <EntryLogo />
        <GoogleFinishForm email={pending.email} name={pending.name ?? ''} suggested={suggested} />
      </Card>
      <EntryFooter />
    </main>
  );
}
