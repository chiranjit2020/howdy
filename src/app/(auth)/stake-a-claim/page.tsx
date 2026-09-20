import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { ClaimForm } from './claim-form';

export const metadata = { title: 'Stake a Claim' };

export default async function StakeAClaimPage() {
  if (await getCurrentUser()) redirect('/home');
  return <ClaimForm />;
}
