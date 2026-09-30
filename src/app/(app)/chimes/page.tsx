import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listChimes } from '@/modules/notifications';
import { pushPublicKey } from '@/modules/push';
import { GlossaryHint } from '@/ui/howdy';
import { AppOnPhone } from '@/ui/pwa/app-on-phone';
import { ChimeList } from './chime-list';

export const metadata = { title: 'Chimes' };

/** Notifications. Protected: the session is checked on the server before any of this renders. */
export default async function ChimesPage() {
  const user = await requireUser();
  const seenAt = new Date().toISOString(); // what this page shows; anything newer stays unread
  const page = await listChimes(user.id, {});
  await attachPortraits(
    user.id,
    page.chimes.map((c) => c.actor),
  );
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
        <div className="flex items-center">
          <h1 className="text-heading text-text-primary">Chimes</h1>
          <GlossaryHint term="chimes" />
        </div>
        <ChimeList
          initial={{
            chimes: page.chimes.map((c) => ({ ...c, at: c.at.toISOString() })),
            nextCursor: page.nextCursor,
            unread: page.unread,
          }}
          seenAt={seenAt}
        />
        <AppOnPhone vapidKey={pushPublicKey()} />
      </main>
    </>
  );
}
