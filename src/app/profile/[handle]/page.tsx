import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/modules/auth';
import type { Actor } from '@/modules/authz';
import { listFence, listWaiting } from '@/modules/fence';
import { lightFor, myLight, type LightView, type MyLight } from '@/modules/lights';
import { getVibeMatrix } from '@/modules/marks';
import { getCoverVersion, getPortraitVersion } from '@/modules/media';
import {
  detailsForViewer,
  getRanchForViewer,
  myDetails,
  resolveHandle,
  type RanchView,
} from '@/modules/profiles';
import { getRelationshipView, listMyRelationships } from '@/modules/relationships';
import { listTributes, listWaitingTributes } from '@/modules/tributes';
import { recheckTrust } from '@/modules/trust';
import { attachPortraits, withCards } from '@/app/_lib/social';
import { getEnv } from '@/platform/config/env';
import { AppError } from '@/platform/errors';
import { clientIp } from '@/platform/http/client-ip';
import { clockOf } from '@/shared/calendar';
import { coverUrl, portraitUrl } from '@/shared/portrait';
import { RanchCover, RanchHeader } from '@/ui/howdy';
import { buttonClasses, ClayCard, EmptyState } from '@/ui/primitives';
import { DetailsCard } from './details-card';
import { EditCover } from './edit-cover';
import { EditPhotoButton, EditProfile, EditProfileButton } from './edit-profile';
import { RelationshipBar } from './relationship-bar';
import { FenceSection } from './fence-section';
import { SignalEditor } from './signal-editor';
import { PorchLightNotice, PosseCard, SignalCard, TracksCard } from './side-cards';
import { TributesSection } from './tributes-section';
import { TrustCard } from './trust-card';
import { VibeMatrixSection } from './vibe-matrix-section';
import { WaitingQueue } from './waiting-queue';

// Ranches are private by default and never belong in a search index.
export const metadata = { title: 'Profile', robots: { index: false, follow: false } };

/** A section that hit the rate limit is shown as "take a breather" instead of failing the whole page. */
async function unlessRateLimited<T>(work: Promise<T>): Promise<{ value: T | null; limited: boolean }> {
  try {
    return { value: await work, limited: false };
  } catch (err) {
    if (err instanceof AppError && err.code === 'RATE_LIMITED') return { value: null, limited: true };
    throw err;
  }
}

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
              title="Slow down a little"
              description="You have visited a lot of profiles. Give it a minute and try again."
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
            <h1 className="text-heading text-text-primary">Log in to visit this profile</h1>
            <p className="text-body text-text-secondary">Log in to your Howdy account to look around.</p>
            <Link href="/login" className={buttonClasses({ size: 'lg', fullWidth: true })}>
              Log in
            </Link>
            <Link href="/signup" className="inline-flex min-h-11 items-center">
              New here? Sign up
            </Link>
          </ClayCard>
        </main>
      </>
    );
  }

  // Everything below needs only the Porch itself, so it is all asked for at once rather than one query after another:
  // on a phone far from the server, each extra round trip in a row is time the person spends looking at the outline.
  const r = ranch;
  const isOwner = Boolean(user && r.isOwner);
  const [
    { rel, photo, light, details, cover },
    { value: fence, limited: fenceBusy },
    waiting,
    waitingTributes,
    posse,
    { value: tributes },
    { value: vibe },
    trust,
    mine,
  ] = await Promise.all([
    // A signed-in visitor also sees how they relate to this person (and can act on it). The photo is offered only to
    // signed-in viewers (the picture itself needs a session), and only on a Porch they may open, which this page has
    // already established. Best-effort: a problem finding it just means the initials show.
    // The Porch Light (ADR-032) comes along too: the owner's own, or this person's if it is on for this viewer.
    (async () => {
      const person = user && !r.isOwner ? await resolveHandle(r.handle) : null;
      const ownerId = r.isOwner ? user?.id : person?.userId;
      const [rel, photo, light, details, cover] = await Promise.all([
        user && person ? getRelationshipView(user.id, person.userId) : null,
        user && ownerId ? getPortraitVersion(ownerId, { userId: user.id }).catch(() => null) : null,
        // Best-effort: without it the Porch simply shows no light.
        (user && person
          ? lightFor(user.id, person.userId)
          : user && r.isOwner
            ? myLight(user.id)
            : Promise.resolve(null)
        ).catch((): MyLight | LightView | null => null),
        // Personal details this viewer may see, each by its own audience (none for signed-out visitors).
        user && ownerId ? detailsForViewer(user.id, ownerId) : Promise.resolve([]),
        // The cover photo, under the Portrait's rule (signed in, on a profile this viewer may open). Best-effort: without
        // it their Howdy cover shows.
        user && ownerId ? getCoverVersion(ownerId, { userId: user.id }).catch(() => null) : null,
      ]);
      return { rel, photo, light, details, cover };
    })(),
    // The Fence is judged separately: it can be narrower than the Porch (e.g. Pals only), and then it is not shown.
    unlessRateLimited(listFence(viewer, r.handle, { rateKey })),
    isOwner && user ? listWaiting(user.id) : null,
    isOwner && user ? listWaitingTributes(user.id) : [],
    // Only the owner sees their own Pals here; nobody else's list is ever shown on a Porch.
    isOwner && user
      ? listMyRelationships(user.id)
          .then((r) => withCards(r, user.id))
          .then((l) => l.posse)
      : null,
    // Tributes and the Vibe Matrix follow the Porch's own visibility (the same rule as the Fence), separately from it.
    unlessRateLimited(listTributes(viewer, r.handle, { rateKey })),
    unlessRateLimited(getVibeMatrix(viewer, r.handle, { rateKey })),
    // Only the owner sees their own Trusted-tick checklist. Checking also brings the stored tick up to date.
    isOwner && user ? recheckTrust(user.id) : null,
    // Your own details with their audiences, for editing them here.
    isOwner && user ? myDetails(user.id) : null,
  ]);
  // Photos for everyone on the Fence whom this viewer may see (initials for the rest).
  await attachPortraits(
    user?.id,
    (fence?.cards ?? []).flatMap((c) => [c.author, ...c.replies.map((reply) => reply.author)]),
  );
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

  // Home's frame: the profile, relationship controls, wall and testimonials in Home's column (672 px, centred, 16 px
  // apart), and from xl (1280 px) up the status and owner cards in an 18rem panel beside it. Narrower, the panel's cards
  // follow the wall in the same column, so the wall is never pushed down a phone screen.
  return (
    <div className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6">
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        {(() => {
          const header = (
            <div className="clay overflow-hidden">
              <RanchCover
                preset={ranch.coverPreset}
                photoUrl={cover ? coverUrl(ranch.handle, cover) : null}
                {...(isOwner
                  ? {
                      action: (
                        <EditCover
                          preset={ranch.coverPreset}
                          photoUrl={cover ? coverUrl(ranch.handle, cover) : null}
                        />
                      ),
                    }
                  : {})}
              />
              <div className="px-5 pb-6 sm:px-7">
                <RanchHeader
                  overlap
                  verified={ranch.verified}
                  // The owner's own check just ran, so their header follows it rather than the decision stored before it.
                  trusted={trust ? trust.earned : ranch.trusted}
                  displayName={ranch.displayName}
                  handle={ranch.handle}
                  bio={ranch.bio}
                  portraitTint={ranch.portraitTint}
                  {...(photo ? { portraitUrl: portraitUrl(ranch.handle, photo) } : {})}
                  {...(badge ? { relationship: badge } : {})}
                  // Only on your own profile (posse is loaded for the owner only): nobody else's friends are shown.
                  {...(posse ? { friendCount: posse.length } : {})}
                  // Your own profile is edited where you see it (photo, name, bio); Settings keeps the rest.
                  {...(isOwner
                    ? { actions: <EditProfileButton />, portraitAction: <EditPhotoButton /> }
                    : {})}
                />
              </div>
            </div>
          );
          return isOwner ? (
            <EditProfile
              displayName={ranch.displayName}
              bio={ranch.bio ?? ''}
              portraitTint={ranch.portraitTint}
              handle={ranch.handle}
              portraitSrc={photo ? portraitUrl(ranch.handle, photo) : null}
            >
              {header}
            </EditProfile>
          ) : (
            header
          );
        })()}

        <DetailsCard
          verified={ranch.verified}
          trusted={trust ? trust.earned : ranch.trusted}
          lines={details}
          mine={mine}
        />

        {rel && (
          <RelationshipBar
            handle={ranch.handle}
            displayName={ranch.displayName}
            initial={rel}
            official={ranch.verified}
            hasPhoto={Boolean(photo)}
          />
        )}

        <div className="min-w-0">
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
                title={fenceBusy ? 'Slow down a little' : 'This wall is private'}
                description={
                  fenceBusy ? 'Give it a minute and try again.' : 'Only people the owner chose can read it.'
                }
              />
            </ClayCard>
          )}
        </div>

        {tributes && (
          <div className="min-w-0">
            <TributesSection handle={ranch.handle} ownerName={ranch.displayName} initial={tributes} />
          </div>
        )}
      </main>

      <aside
        aria-label="Status, friends and visitors"
        className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 xl:max-w-none"
      >
        {light && (
          <PorchLightNotice
            owner={ranch.isOwner}
            displayName={ranch.displayName}
            handle={ranch.handle}
            untilLabel={clockOf(light.until)}
            note={light.note}
            {...('audience' in light ? { audience: light.audience } : {})}
          />
        )}
        {ranch.signal && (
          <SignalCard text={ranch.signal.text} expiresLabel={hoursLeft(ranch.signal.expiresAt)} />
        )}
        {ranch.isOwner && <SignalEditor current={ranch.signal?.text} />}
        {waiting && <WaitingQueue waiting={waiting} tributes={waitingTributes} />}
        {vibe && <VibeMatrixSection handle={ranch.handle} initial={vibe} />}
        {trust && !trust.team && <TrustCard status={trust} />}
        {posse && <PosseCard members={posse} />}
        {ranch.isOwner && <TracksCard />}
      </aside>
    </div>
  );
}
