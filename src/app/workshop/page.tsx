import { withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getPrefs } from '@/modules/notifications';
import { getOwnRanch } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { AppHeader } from '@/app/_lib/app-header';
import { PeopleControls } from './people-controls';
import { BoundaryForm, ChimePrefsForm, FenceRulesForm, TendForm } from './ranch-forms';

export const metadata = { title: 'Workshop' };

/** The Workshop (settings). Protected: the session is checked on the server before any of this renders. */
export default async function WorkshopPage() {
  const user = await requireUser();
  const [ranch, prefs, lists] = await Promise.all([
    getOwnRanch(user.id),
    getPrefs(user.id),
    listMyRelationships(user.id).then(withCards),
  ]);
  return (
    <>
      <AppHeader current="workshop" />
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
        <h1 className="text-heading text-text-primary">Workshop</h1>
        <TendForm displayName={ranch.displayName} portraitTint={ranch.portraitTint} handle={user.handle} />
        <BoundaryForm ranchVisibility={ranch.ranchVisibility} signalVisibility={ranch.signalVisibility} />
        <FenceRulesForm
          fenceVisibility={ranch.fenceVisibility}
          fencePosting={ranch.fencePosting}
          fenceReview={ranch.fenceReview}
        />
        <ChimePrefsForm initial={prefs} />
        <PeopleControls blocked={lists.blocked} muted={lists.muted} restricted={lists.restricted} />
      </main>
    </>
  );
}
