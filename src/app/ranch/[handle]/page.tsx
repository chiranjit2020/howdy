import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { listFence, listWaiting, type FencePage, type Waiting } from '@/modules/fence';
import { getPortraitVersion } from '@/modules/media';
import { getRanchForViewer, resolveHandle, type RanchView } from '@/modules/profiles';
import { getRelationshipView, listMyRelationships } from '@/modules/relationships';
import { withCards } from '@/app/_lib/social';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { clientIp } from '@/platform/http/client-ip';
import { portraitUrl } from '@/shared/portrait';
import { RanchCover, RanchHeader } from '@/ui/howdy';
import { buttonClasses, ClayCard, EmptyState } from '@/ui/primitives';
import { RelationshipBar } from './relationship-bar';
import { FenceSection } from './fence-section';
import { SignalEditor } from './signal-editor';
import { PosseCard, SignalCard } from './side-cards';
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
  // The photo is offered only to signed-in viewers (the picture itself needs a session), and only on a Ranch they may open, which
  // this page has already established. Best-effort: a problem finding it just means the initials show.
  const ownerId = ranch.isOwner ? user?.id : person?.userId;
  const photo = user && ownerId ? await getPortraitVersion(ownerId).catch(() => null) : null;
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

  // Only the owner sees their own Posse here; nobody else's list is ever shown on a Ranch.
  const posse = user && ranch.isOwner ? (await withCards(await listMyRelationships(user.id))).posse : null;

  // Two columns from `lg` up: the profile, relationship controls and Fence on the left, the Signal and owner cards on the
  // right (which spans the left column's rows). On a phone everything stacks in reading order.
  return (
    <main id="main" className="grid items-start gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="clay overflow-hidden lg:col-start-1">
        <RanchCover />
        <div className="px-5 pb-6 sm:px-7">
          <RanchHeader
            overlap
            displayName={ranch.displayName}
            handle={ranch.handle}
            portraitTint={ranch.portraitTint}
            {...(photo ? { portraitUrl: portraitUrl(ranch.handle, photo) } : {})}
            {...(badge ? { relationship: badge } : {})}
            actions={
              ranch.isOwner ? (
                <Link href="/workshop" className={buttonClasses({ variant: 'secondary' })}>
                  Tend the Ranch
                </Link>
              ) : undefined
            }
          />
        </div>
      </div>

      {rel && (
        <div className="lg:col-start-1">
          <RelationshipBar handle={ranch.handle} displayName={ranch.displayName} initial={rel} />
        </div>
      )}

      <aside
        aria-label="Signal and Posse"
        className="flex flex-col gap-6 lg:col-start-2 lg:row-span-3 lg:row-start-1"
      >
        {ranch.signal && (
          <SignalCard text={ranch.signal.text} expiresLabel={hoursLeft(ranch.signal.expiresAt)} />
        )}
        {ranch.isOwner && <SignalEditor current={ranch.signal?.text} />}
        {waiting && <WaitingQueue waiting={waiting} />}
        {posse && <PosseCard members={posse} />}
      </aside>

      <div className="min-w-0 lg:col-start-1">
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
      </div>
    </main>
  );
}
