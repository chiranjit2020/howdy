import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { ClaimForm } from './claim-form';

export const metadata = { title: 'Stake a Claim' };

export default async function StakeAClaimPage() {
  if (await getCurrentUser()) redirect('/home');
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <ClaimForm />
    </main>
  );
}
