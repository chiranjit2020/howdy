import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Step Inside' };

export default async function StepInsidePage() {
  if (await getCurrentUser()) redirect('/home');
  return <LoginForm />;
}
