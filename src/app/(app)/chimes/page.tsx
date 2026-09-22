import { requireUser } from '@/modules/auth';
import { listChimes } from '@/modules/notifications';
import { ChimeList } from './chime-list';

export const metadata = { title: 'Chimes' };

/** Notifications. Protected: the session is checked on the server before any of this renders. */
export default async function ChimesPage() {
  const user = await requireUser();
  const page = await listChimes(user.id, {});
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-heading text-text-primary">Chimes</h1>
        <ChimeList
          initial={{
            chimes: page.chimes.map((c) => ({ ...c, at: c.at.toISOString() })),
            nextCursor: page.nextCursor,
            unread: page.unread,
          }}
        />
      </main>
    </>
  );
}
