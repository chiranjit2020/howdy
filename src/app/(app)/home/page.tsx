import Link from 'next/link';
import { withCards } from '@/app/_lib/social';
import { Glyph } from '@/ui/art/glyph';
import { listMySessions, requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { cn } from '@/ui/cn';
import { Badge, buttonClasses, ClayCard } from '@/ui/primitives';
import { HitTheTrail, HitTheTrailEverywhere, OpenGates } from './home-actions';

export const metadata = { title: 'Home' };

const SMALL = buttonClasses({ variant: 'secondary', size: 'sm', compact: true });

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
        <ClayCard className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
          {/* The picture sits beside the greeting rather than above it, which saves a row on a phone. */}
          <div className="flex items-center gap-3">
            <Glyph emoji="📜" size="free" className="size-10 shrink-0 sm:size-14" />
            <div className="min-w-0">
              <h1 className="text-heading text-text-primary">Howdy, {ranch.displayName}</h1>
              <p className="flex flex-wrap items-center gap-x-2 text-caption text-text-secondary">
                <span>Deed granted, @{user.handle}.</span>
                <Badge tone="success">Email confirmed</Badge>
              </p>
            </div>
          </div>
          {/* One main action, then the everyday small ones in a single row of three. */}
          <Link href={`/porch/${user.handle}`} className={buttonClasses({ fullWidth: true })}>
            Visit your Porch
          </Link>
          {/* Each takes the width its label needs, so all three fit one row even on a 320 px phone (it may wrap only
              there, when a "new requests" count is showing). */}
          <div className="flex flex-wrap gap-2">
            <Link href="/pals" className={cn(SMALL, 'flex-auto')}>
              Pals{requests > 0 && <span className="sr-only">, </span>}
              {requests > 0 && (
                <Badge tone="accent">
                  {requests}
                  <span className="sr-only"> new</span>
                </Badge>
              )}
            </Link>
            <Link href="/workshop" className={cn(SMALL, 'flex-auto')}>
              Workshop
            </Link>
            <HitTheTrail className="flex-auto" />
          </div>
          <div className="-mt-2 -mb-2 flex justify-end">
            <HitTheTrailEverywhere />
          </div>
        </ClayCard>
        {/* Technical, and rarely needed: a quiet folded line instead of a card of its own. */}
        <OpenGates initial={gates} />
      </main>
    </>
  );
}
