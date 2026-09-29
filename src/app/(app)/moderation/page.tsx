import { notFound } from 'next/navigation';
import { requireUser } from '@/modules/auth';
import { isModerator, listAppeals, listQueue } from '@/modules/moderation';
import { ModerationView } from './moderation-view';

export const metadata = { title: 'Moderation', robots: { index: false, follow: false } };

/**
 * The moderation queue and the account lookup. Moderators only: anyone else gets the ordinary 404 page, the same as the
 * API. Deliberately no `loading.tsx` here — it would make Next stream a 200 before the role check can answer 404.
 */
export default async function ModerationPage() {
  const user = await requireUser();
  if (!(await isModerator(user.id))) notFound();
  const [initial, appeals] = await Promise.all([listQueue(user.id, {}), listAppeals(user.id, {})]);
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
      <h1 className="text-heading text-text-primary">Moderation</h1>
      <ModerationView initial={initial} appeals={appeals} />
    </main>
  );
}
