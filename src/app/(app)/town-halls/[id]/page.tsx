import { notFound } from 'next/navigation';
import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getTownHall, listBans, listFeed, listHeld, listMembers, listRequests } from '@/modules/town-halls';
import { TownHallDetailView } from './detail-view';

export const metadata = { title: 'Town Hall', robots: { index: false, follow: false } };

/** One Town Hall: header, your membership state, and (members only) the feed and the roster; staff also get the held tray, join requests and the ban list. */
export default async function TownHallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const townHall = await getTownHall(user.id, id);
  if (!townHall) notFound();
  const member = townHall.membership === 'active';
  const staff = townHall.myRole === 'owner' || townHall.myRole === 'deputy';
  const [members, feed, held, requests, bans] = member
    ? await Promise.all([
        listMembers(user.id, id, {}),
        listFeed(user.id, id, {}),
        staff ? listHeld(user.id, id) : Promise.resolve(null),
        staff ? listRequests(user.id, id) : Promise.resolve(null),
        staff ? listBans(user.id, id) : Promise.resolve(null),
      ])
    : [null, null, null, null, null];
  await attachPortraits(user.id, [
    ...(requests ?? []),
    ...(bans ?? []),
    ...(members?.members ?? []),
    ...(feed?.posts.flatMap((p) => [p.author, ...p.replies.map((r) => r.author)]) ?? []),
    ...[...(held?.posts ?? []), ...(held?.replies ?? [])].map((h) => h.author),
  ]);

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
      <TownHallDetailView
        townHall={townHall}
        initialMembers={members}
        initialFeed={feed}
        initialHeld={held}
        initialRequests={requests}
        initialBans={bans}
      />
    </main>
  );
}
