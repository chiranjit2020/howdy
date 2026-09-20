import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { ForgotForm } from './forgot-form';

export const metadata = { title: 'Lost your key?' };

export default async function LostYourKeyPage() {
  if (await getCurrentUser()) redirect('/home');
  return <ForgotForm />;
}
