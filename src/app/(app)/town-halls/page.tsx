import { requireUser } from '@/modules/auth';
import { listDirectory, listMine, listMyInvites } from '@/modules/town-halls';
import { GlossaryHint } from '@/ui/howdy';
import { CreateTownHallForm } from './create-form';
import { TownHallsView } from './town-halls-view';

export const metadata = { title: 'Town Halls' };

/** Directory, your own Town Halls and pending invites. Membership only this phase — no shared feed yet. */
export default async function TownHallsPage() {
  const user = await requireUser();
  const [directory, mine, invites] = await Promise.all([
    listDirectory(user.id, {}),
    listMine(user.id),
    listMyInvites(user.id),
  ]);
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center">
        <h1 className="text-heading text-text-primary">Town Halls</h1>
        <GlossaryHint term="townHalls" />
      </div>
      <CreateTownHallForm />
      <TownHallsView initialDirectory={directory} mine={mine} invites={invites} />
    </main>
  );
}
