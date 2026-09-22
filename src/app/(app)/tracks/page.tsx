import { requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { listTracks } from '@/modules/tracks';
import { TrackItem, type CoarseWhen } from '@/ui/howdy';
import { ClayCard, EmptyState } from '@/ui/primitives';
import { ShadowWalk } from './shadow-walk';

export const metadata = { title: 'Tracks' };

const ORDER: CoarseWhen[] = ['today', 'yesterday', 'this-week'];

/** Who stopped by this week. Protected: the session is checked on the server before any of this renders. */
export default async function TracksPage() {
  const user = await requireUser();
  const [tracks, ranch] = await Promise.all([listTracks(user.id), getOwnRanch(user.id)]);
  const hiddenTotal = ORDER.reduce((n, w) => n + tracks.hidden[w], 0);
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-heading text-text-primary">Tracks</h1>
        <ShadowWalk initial={ranch.shadowWalk} />

        {tracks.frozen ? (
          <ClayCard>
            <EmptyState
              as="h2"
              icon="🔒"
              title="Your Tracks are frozen"
              description="Step out of the shadows to see who has stopped by. While Shadow Walk is on, your own visits stay hidden too."
            />
          </ClayCard>
        ) : tracks.people.length === 0 && hiddenTotal === 0 ? (
          <ClayCard>
            <EmptyState
              as="h2"
              icon="👣"
              title="No Tracks this week"
              description="When someone opens your Ranch, they leave a footprint here for a few days."
            />
          </ClayCard>
        ) : (
          <>
            {tracks.people.length > 0 && (
              <section aria-labelledby="posse-tracks" className="flex flex-col gap-3">
                <h2 id="posse-tracks" className="text-title text-text-primary">
                  Your Posse dropped by
                </h2>
                <ul className="flex flex-col gap-2">
                  {tracks.people.map((p) => (
                    <TrackItem
                      key={p.handle}
                      visitor={{ name: p.displayName, handle: p.handle }}
                      href={`/ranch/${p.handle}`}
                      when={p.when}
                    />
                  ))}
                </ul>
              </section>
            )}
            {hiddenTotal > 0 && (
              <section aria-labelledby="hidden-tracks" className="flex flex-col gap-3">
                <h2 id="hidden-tracks" className="text-title text-text-primary">
                  Others
                </h2>
                <ul className="flex flex-col gap-2">
                  {ORDER.filter((w) => tracks.hidden[w] > 0).map((w) => (
                    <TrackItem
                      key={w}
                      count={tracks.hidden[w]}
                      hint="People outside your Posse. That is all anyone can know."
                      when={w}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="text-caption text-text-secondary">
          Tracks stay for {tracks.days} days and only ever say Today, Yesterday or This week. People in your
          Posse see when you stop by their Ranch unless you turn on Shadow Walk; everyone else only ever adds
          to a count.
        </p>
      </main>
    </>
  );
}
