import { notFound } from 'next/navigation';
import { requireUser } from '@/modules/auth';
import { getTownHall, listMembers } from '@/modules/town-halls';
import { TownHallDetailView } from './detail-view';

export const metadata = { title: 'Town Hall', robots: { index: false, follow: false } };

/** One Town Hall: header, your membership state, and (members only) the roster. */
export default async function TownHallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const townHall = await getTownHall(user.id, id);
  if (!townHall) notFound();
  const members = townHall.membership === 'active' ? await listMembers(user.id, id, {}) : null;

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
      <TownHallDetailView townHall={townHall} initialMembers={members} />
    </main>
  );
}
