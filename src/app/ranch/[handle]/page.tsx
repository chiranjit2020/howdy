import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { listFence, listWaiting, type FencePage, type Waiting } from '@/modules/fence';
import { getRanchForViewer, resolveHandle, type RanchView } from '@/modules/profiles';
import { getRelationshipView } from '@/modules/relationships';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { clientIp } from '@/platform/http/client-ip';
import { RanchHeader } from '@/ui/howdy';
import { buttonClasses, ClayCard, EmptyState } from '@/ui/primitives';
import { AppHeader } from '@/app/_lib/app-header';
import { RelationshipBar } from './relationship-bar';
import { FenceSection } from './fence-section';
import { SignalEditor } from './signal-editor';
import { WaitingQueue } from './waiting-queue';

// Ranches are private by default and never belong in a search index.
export const metadata = { title: 'Ranch', robots: { index: false, follow: false } };

function hoursLeft(expiresAt: Date): string {
  const h = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000));
  return `${h}h left`;
}

export default async function RanchPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await getCurrentUser();
  const viewer: Actor = user ? { kind: 'user', id: user.id, status: 'active' } : { kind: 'anonymous' };
  const rateKey = user?.id ?? clientIp(await headers(), getEnv().TRUST_PROXY_HOPS);

  let ranch: RanchView | null;
  try {
    ranch = await getRanchForViewer(viewer, handle, { rateKey });
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') {
      return (
        <main id="main" className="mx-auto max-w-md px-4 py-16">
          <ClayCard>
            <EmptyState
              as="h1"
              icon="⏳"
              title="Easy there, partner"
              description="You have opened a lot of Ranches. Give it a minute and try again."
            />
          </ClayCard>
        </main>
      );
    }
    throw err;
  }

  if (!ranch) {
    // Signed in: a hidden Ranch is simply not found. Signed out: the same prompt whether the Ranch is missing, hidden
    // or members-only, so this page never confirms that a particular Ranch exists.
    if (user) notFound();
    return (
      <>
        <AppHeader />
        <main id="main" className="mx-auto max-w-md px-4 py-16">
          <ClayCard className="flex flex-col items-center gap-3 p-8 text-center">
            <h1 className="text-heading text-text-primary">Step inside to visit this Ranch</h1>
            <p className="text-body text-text-secondary">Log in to your Howdy account to look around.</p>
            <Link href="/step-inside" className={buttonClasses({ size: 'lg', fullWidth: true })}>
              Step Inside
            </Link>
            <Link href="/stake-a-claim" className="inline-flex min-h-11 items-center">
              New here? Stake a Claim
            </Link>
          </ClayCard>
        </main>
      </>
    );
  }

  // A signed-in visitor also sees how they relate to this person (and can act on it).
  const person = user && !ranch.isOwner ? await resolveHandle(ranch.handle) : null;
  const rel = user && person ? await getRelationshipView(user.id, person.userId) : null;
  const badge = !rel
    ? undefined
    : rel.posse === 'member'
      ? rel.closeByMe
        ? 'CLOSE_POSSE'
        : 'POSSE'
      : rel.posse === 'sent'
        ? 'REQUESTED'
        : rel.scouting
          ? 'SCOUTING'
          : undefined;

  // The Fence is judged separately: it can be narrower than the Ranch (e.g. Posse only), and then it is simply not shown.
  let fence: FencePage | null = null;
  let fenceBusy = false;
  try {
    fence = await listFence(viewer, ranch.handle, { rateKey });
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') fenceBusy = true;
    else throw err;
  }
  const waiting: Waiting | null = user && ranch.isOwner ? await listWaiting(user.id) : null;

  return (
    <>
      <AppHeader current={ranch.isOwner ? 'ranch' : undefined} />
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <ClayCard className="p-8">
          <RanchHeader
            displayName={ranch.displayName}
            handle={ranch.handle}
            portraitTint={ranch.portraitTint}
            {...(badge ? { relationship: badge } : {})}
            {...(ranch.signal
              ? { signal: ranch.signal.text, signalExpiresLabel: hoursLeft(ranch.signal.expiresAt) }
              : {})}
            actions={
              ranch.isOwner ? (
                <Link href="/workshop" className={buttonClasses({ variant: 'secondary' })}>
                  Tend the Ranch
                </Link>
              ) : undefined
            }
          />
        </ClayCard>
        {ranch.isOwner && <SignalEditor current={ranch.signal?.text} />}
        {rel && <RelationshipBar handle={ranch.handle} displayName={ranch.displayName} initial={rel} />}
        {waiting && <WaitingQueue waiting={waiting} />}
        {fence ? (
          <FenceSection
            // Server data changed (e.g. the owner approved a card): start from it instead of the old client copy.
            key={fence.cards.map((c) => `${c.id}:${c.waiting}`).join(',')}
            handle={ranch.handle}
            ownerName={ranch.displayName}
            initial={fence}
            signedIn={Boolean(user)}
          />
        ) : (
          <ClayCard>
            <EmptyState
              as="h2"
              icon="🪵"
              title={fenceBusy ? 'Easy there, partner' : 'This Fence is private'}
              description={
                fenceBusy ? 'Give it a minute and try again.' : 'Only people the owner chose can read it.'
              }
            />
          </ClayCard>
        )}
      </main>
    </>
  );
}
