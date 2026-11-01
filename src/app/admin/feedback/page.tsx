import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminStanding } from '@/modules/admin';
import { requireUser } from '@/modules/auth';
import { listFeedback } from '@/modules/feedback';
import { FeedbackInbox } from './feedback-inbox';

export const metadata = { title: 'Feedback', robots: { index: false, follow: false } };

/**
 * Feedback members sent from /feedback (ADR-059), newest first, for admins with two-step. Anyone else gets the
 * ordinary 404, like the rest of the Control Room. No `loading.tsx`: the role check answers before anything streams.
 */
export default async function FeedbackAdminPage() {
  const user = await requireUser();
  const standing = await adminStanding(user.id);
  if (standing === 'not_admin') notFound();
  if (standing === 'needs_two_step') {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-8">
        <h1 className="text-caption font-bold">Howdy Control Room</h1>
        <p className="text-body">Feedback needs two-step sign-in. Turn it on under Sign-in security.</p>
        <Link
          href="/settings/account#sign-in-security"
          className="inline-flex min-h-11 items-center self-start text-on-island underline underline-offset-2"
        >
          Go to Sign-in security →
        </Link>
      </main>
    );
  }
  const { items } = await listFeedback(user.id);
  return <FeedbackInbox initial={items} />;
}
