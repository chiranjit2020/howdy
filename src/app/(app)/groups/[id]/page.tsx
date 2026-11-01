import { notFound } from 'next/navigation';
import { attachPortraits } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getTownHall, listBans, listFeed, listHeld, listMembers, listRequests } from '@/modules/town-halls';
import { TownHallDetailView } from './detail-view';

export const metadata = { title: 'Group', robots: { index: false, follow: false } };

/**
 * One circle (ADR-054): its header and your membership, then (members only) Posts and Members, and for the Owner and
 * Deputies the held tray, join requests and a Manage tab. In Home's frame, with "About this group" in the right panel.
 */
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
    <TownHallDetailView
      townHall={townHall}
      initialMembers={members}
      initialFeed={feed}
      initialHeld={held}
      initialRequests={requests}
      initialBans={bans}
    />
  );
}
