import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';

/** `/` has no content of its own: signed-in visitors go home, everyone else to the welcome page (the shareable link). */
export default async function Home() {
  redirect((await getCurrentUser()) ? '/home' : '/welcome');
}
