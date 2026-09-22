import Link from 'next/link';
import { withCards } from '@/app/_lib/social';
import { Glyph } from '@/ui/art/glyph';
import { listMySessions, requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
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
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
        <ClayCard className="flex flex-col gap-3 p-8">
          <Glyph emoji="📜" size="hero" />
          <h1 className="text-heading text-text-primary">Howdy, {ranch.displayName}</h1>
          <p className="text-body text-text-secondary">
            Deed granted, @{user.handle}. <Badge tone="success">Email confirmed</Badge>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/ranch/${user.handle}`} className={buttonClasses()}>
              Visit your Ranch
            </Link>
            <Link href="/posse" className={buttonClasses({ variant: 'secondary' })}>
              Posse{requests > 0 && <span className="sr-only">, </span>}
              {requests > 0 && <Badge tone="accent">{requests} new</Badge>}
            </Link>
            <Link href="/workshop" className={buttonClasses({ variant: 'secondary' })}>
              Workshop
            </Link>
          </div>
          <HitTheTrail />
        </ClayCard>
        <ClayCard className="p-6">
          <OpenGates initial={gates} />
        </ClayCard>
      </main>
    </>
  );
}
