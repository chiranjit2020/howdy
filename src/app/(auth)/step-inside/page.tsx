import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { AuthCard } from '../auth-card';

export const metadata = { title: 'Step Inside' };

export default async function StepInsidePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-6 sm:py-8">
      <AuthCard initial="step-inside" />
    </main>
  );
}
