import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { EntryCard } from '@/ui/auth/entry-shell';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Forgot password?' };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <EntryCard>
      <ForgotForm />
    </EntryCard>
  );
}
