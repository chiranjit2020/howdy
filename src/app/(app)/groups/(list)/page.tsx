import { requireUser } from '@/modules/auth';
import { listDirectory, listMine, listMyInvites } from '@/modules/town-halls';
import { PageFrame } from '@/ui/howdy/page-frame';
import { CreateTownHallForm } from './create-form';
import { FriendsGroups, InvitesCard, MyGroups } from './town-halls-view';

export const metadata = { title: 'Groups' };

/**
 * Your circles (ADR-054): invites waiting for an answer, the groups you are in, and — in the right panel — groups your
 * friends are in. There is no public directory: a group is for people who know each other.
 */
export default async function TownHallsPage() {
  const user = await requireUser();
  const [directory, mine, invites] = await Promise.all([
    listDirectory(user.id, {}),
    listMine(user.id),
    listMyInvites(user.id),
  ]);
  return (
    <PageFrame rail={<FriendsGroups initial={directory} />} railLabel="Find groups">
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 text-heading text-text-primary">Groups</h1>
        <CreateTownHallForm />
      </div>
      <InvitesCard initial={invites} />
      <MyGroups mine={mine} />
    </PageFrame>
  );
}
