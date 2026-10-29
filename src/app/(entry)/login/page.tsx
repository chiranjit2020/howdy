import { redirect } from 'next/navigation';
import { getCurrentUser, googleEnabled, turnstileSiteKey } from '@/modules/auth';
import { AuthCard } from '../auth-card';

export const metadata = { title: 'Log in' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main
      id="main"
      // Centred on the screen (these pages have no top bar). No side padding of its own: the shell's px-4
      // already gives the gutter, and doubling it squeezes the card on a 320px phone.
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center py-4"
    >
      <AuthCard initial="login" google={googleEnabled()} turnstileSiteKey={turnstileSiteKey()} />
    </main>
  );
}
