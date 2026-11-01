import { withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { listMyRelationships } from '@/modules/relationships';
import { PeopleControls } from '../people-controls';

export const metadata = { title: 'People settings' };

/** Settings › People: everyone you have blocked, muted or restricted, with a way to undo each. */
export default async function PeopleSettingsPage() {
  const user = await requireUser();
  const lists = await listMyRelationships(user.id).then((r) => withCards(r, user.id));
  return <PeopleControls blocked={lists.blocked} muted={lists.muted} restricted={lists.restricted} />;
}
