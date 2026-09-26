import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { AuthCard } from '../auth-card';

export const metadata = { title: 'Step Inside' };

export default async function StepInsidePage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main
      id="main"
      // Centred in the space under the top bar (4rem + its 1px border). No side padding of its own: the shell's px-4
      // already gives the gutter, and doubling it squeezes the card on a 320px phone.
      className="mx-auto flex min-h-[calc(100dvh-4rem-1px)] w-full max-w-md flex-col justify-center py-4"
    >
      <AuthCard initial="step-inside" />
    </main>
  );
}
