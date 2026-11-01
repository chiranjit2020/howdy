import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { listTracks } from '@/modules/tracks';
import { COARSE_LABEL, TrackItem, type CoarseWhen } from '@/ui/howdy';
import { EyeOffIcon, TracksIcon } from '@/ui/icons';
import { RailCard } from '@/ui/howdy/rail-card';
import { ClayCard, EmptyState } from '@/ui/primitives';
import { ShadowWalk } from './shadow-walk';

export const metadata = { title: 'Profile visitors' };

const ORDER: CoarseWhen[] = ['today', 'yesterday', 'this-week'];

/**
 * Who stopped by this week, in Home's frame: one list grouped Today / Yesterday / This week — friends by name, then
 * everyone else as a single count — and Private browsing with how visits work in the right panel. Protected: the
 * session is checked on the server before any of this renders.
 */
export default async function TracksPage() {
  const user = await requireUser();
  const [tracks, ranch] = await Promise.all([listTracks(user.id), getOwnRanch(user.id)]);
  // Named visitors only: the hidden ones stay counts, with nothing to attach a photo to.
  await attachPortraits(user.id, tracks.people);
  const groups = ORDER.map((when) => ({
    when,
    people: tracks.people.filter((p) => p.when === when),
    hidden: tracks.hidden[when],
  })).filter((g) => g.people.length > 0 || g.hidden > 0);

  return (
    <div className="flex w-full flex-col gap-4 py-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start xl:gap-6">
      <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4">
        <h1 className="text-heading text-text-primary">Profile visitors</h1>
        {tracks.frozen ? (
          <ClayCard>
            <EmptyState
              as="h2"
              icon={<EyeOffIcon className="text-text-muted" />}
              title="Your visitor list is paused"
              description="Turn off Private browsing to see who has stopped by. While it is on, your own visits stay hidden too."
            />
          </ClayCard>
        ) : groups.length === 0 ? (
          <ClayCard>
            <EmptyState
              as="h2"
              icon={<TracksIcon className="text-text-muted" />}
              title="No visitors this week"
              description="When someone stops by your profile, it shows here for a few days."
            />
          </ClayCard>
        ) : (
          <ClayCard className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g.when} aria-labelledby={`visits-${g.when}`} className="flex flex-col">
                <h2
                  id={`visits-${g.when}`}
                  className="text-metadata font-semibold tracking-wider text-text-secondary uppercase"
                >
                  {COARSE_LABEL[g.when]}
                </h2>
                <ul className="flex flex-col divide-y divide-border">
                  {g.people.map((p) => (
                    <TrackItem
                      key={p.handle}
                      visitor={{ name: p.displayName, handle: p.handle, avatarUrl: p.portraitUrl ?? null }}
                      href={`/profile/${p.handle}`}
                    />
                  ))}
                  {g.hidden > 0 && (
                    <TrackItem count={g.hidden} hint="Not your friends. That is all anyone can know." />
                  )}
                </ul>
              </section>
            ))}
          </ClayCard>
        )}
      </main>
      <aside
        aria-label="About visits"
        className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 xl:max-w-none"
      >
        <ShadowWalk initial={ranch.shadowWalk} />
        <RailCard id="how-visits-work" title="How visits work">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-caption text-text-secondary">
            <li>Friends who stop by are named. Anyone else is only a count.</li>
            <li>A visit stays {tracks.days} days and only says Today, Yesterday or This week.</li>
            <li>Your friends see your visits too, unless you turn on Private browsing.</li>
          </ul>
        </RailCard>
      </aside>
    </div>
  );
}
