import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Lost your key?' };

export default async function LostYourKeyPage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <ForgotForm />
    </main>
  );
}
