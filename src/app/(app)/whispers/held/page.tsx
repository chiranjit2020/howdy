import Link from 'next/link';
import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listHeld } from '@/modules/whispers';
import { ClayCard, EmptyState } from '@/ui/primitives';
import { HeldList } from './held-list';

export const metadata = { title: 'Held back', robots: { index: false, follow: false } };

/**
 * The held tray (ADR-026): Whispers from people I have restricted, kept out of my threads. Only I see this page, and
 * opening it tells the senders nothing — to them their Whispers still look delivered.
 */
export default async function HeldPage() {
  const user = await requireUser();
  const held = await listHeld(user.id);
  await attachPortraits(
    user.id,
    held.map((w) => w.from),
  );
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-text-primary">Held back</h1>
        <p className="text-caption text-text-secondary">
          Whispers from people you have restricted. They were never shown in your threads or rung for, and
          reading them here does not tell anyone. They vanish after 7 days, like every Whisper.
        </p>
        <Link href="/whispers" className="inline-flex min-h-11 items-center self-start text-caption">
          Back to Whispers
        </Link>
      </div>
      {held.length === 0 ? (
        <ClayCard>
          <EmptyState
            as="h2"
            icon="🤫"
            title="Nothing held back"
            description="When someone you have restricted Whispers you, it waits here instead of in your threads."
          />
        </ClayCard>
      ) : (
        <HeldList held={held} />
      )}
    </main>
  );
}
