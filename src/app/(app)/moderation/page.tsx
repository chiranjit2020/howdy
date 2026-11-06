import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/modules/auth';
import { listAppeals, listQueue, moderatorStanding, STAFF_TWO_STEP_MESSAGE } from '@/modules/moderation';
import { PageFrame } from '@/ui/howdy/page-frame';
import { ModerationView } from './moderation-view';

export const metadata = { title: 'Moderation', robots: { index: false, follow: false } };

/**
 * The moderation queue and the account lookup. Moderators only: anyone else gets the ordinary 404 page, the same as the
 * API. Staff without two-step sign-in are told to turn it on first (ADR-040). Deliberately no `loading.tsx` here — it
 * would make Next stream a 200 before the role check can answer 404.
 */
export default async function ModerationPage() {
  const user = await requireUser();
  const standing = await moderatorStanding(user.id);
  if (standing === 'not_staff') notFound();
  if (standing === 'needs_two_step') {
    return (
      <PageFrame>
        <h1 className="text-heading text-text-primary">Moderation</h1>
        <section className="flex flex-col gap-3 rounded-md bg-surface-sunken p-4">
          <p className="text-body text-text-primary">{STAFF_TWO_STEP_MESSAGE}</p>
          <Link
            href="/settings/account#sign-in-security"
            className="inline-flex min-h-11 items-center self-start"
          >
            Go to Sign-in security
          </Link>
        </section>
      </PageFrame>
    );
  }
  const [initial, appeals] = await Promise.all([listQueue(user.id, {}), listAppeals(user.id, {})]);
  return (
    <PageFrame>
      <h1 className="text-heading text-text-primary">Moderation</h1>
      <ModerationView initial={initial} appeals={appeals} />
    </PageFrame>
  );
}
