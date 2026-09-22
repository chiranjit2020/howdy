import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Step Inside' };

export default async function StepInsidePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <LoginForm />
    </main>
  );
}
