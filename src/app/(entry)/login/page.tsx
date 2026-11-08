import { redirect } from 'next/navigation';
import { getCurrentUser, googleEnabled, turnstileSiteKey } from '@/modules/auth';
import { AuthCard } from '../auth-card';
import { AuthSplit } from '../auth-split';

export const metadata = { title: 'Log in' };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <AuthSplit>
      <AuthCard initial="login" google={googleEnabled()} turnstileSiteKey={turnstileSiteKey()} />
    </AuthSplit>
  );
}
