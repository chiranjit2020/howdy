import Link from 'next/link';
import { withCards } from '@/app/_lib/social';
import { Glyph } from '@/ui/art/glyph';
import { listMySessions, requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { cn } from '@/ui/cn';
import { Badge, buttonClasses, ClayCard } from '@/ui/primitives';
import { HitTheTrail, OpenGates } from './home-actions';

export const metadata = { title: 'Home' };

/** First protected page. The session check happens on the server: an unauthenticated request never reaches the markup. */
export default async function HomePage() {
  const user = await requireUser();
  const ranch = await getOwnRanch(user.id);
  // Only requests from people who are still active count (a suspended account's request is not shown or counted).
  const requests = (await withCards(await listMyRelationships(user.id))).incoming.length;
  const gates = (await listMySessions()).map((s) => ({
    id: s.id,
    deviceLabel: s.deviceLabel,
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s.current,
  }));

  return (
    <>
      {/* No side padding of its own: the shell's px-4 is the gutter, so the cards use the full phone width. */}
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
        <ClayCard className="flex flex-col gap-3 p-4 sm:p-8">
          {/* The picture sits beside the greeting rather than above it, which saves a row on a phone. */}
          <div className="flex items-center gap-3">
            <Glyph emoji="📜" size="free" className="size-12 shrink-0 sm:size-16" />
            <div className="min-w-0">
              <h1 className="text-heading text-text-primary">Howdy, {ranch.displayName}</h1>
              <p className="text-body text-text-secondary">
                Deed granted, @{user.handle}. <Badge tone="success">Email confirmed</Badge>
              </p>
            </div>
          </div>
          {/* Two columns on a phone, with the Ranch across the top; one wrapping row from sm up. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <Link href={`/porch/${user.handle}`} className={cn(buttonClasses(), 'col-span-2')}>
              Visit your Porch
            </Link>
            <Link href="/pals" className={buttonClasses({ variant: 'secondary' })}>
              Pals{requests > 0 && <span className="sr-only">, </span>}
              {requests > 0 && <Badge tone="accent">{requests} new</Badge>}
            </Link>
            <Link href="/workshop" className={buttonClasses({ variant: 'secondary' })}>
              Workshop
            </Link>
          </div>
          <HitTheTrail />
        </ClayCard>
        <ClayCard className="p-4 sm:p-6">
          <OpenGates initial={gates} />
        </ClayCard>
      </main>
    </>
  );
}
