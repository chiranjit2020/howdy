import { withCards } from '@/app/_lib/social';
import { requireUser } from '@/modules/auth';
import { getPortraitVersion } from '@/modules/media';
import { getPrefs } from '@/modules/notifications';
import { getOwnRanch } from '@/modules/profiles';
import { listMyRelationships } from '@/modules/relationships';
import { AppFrame } from '@/app/_lib/app-shell';
import { portraitUrl } from '@/shared/portrait';
import { PeopleControls } from './people-controls';
import { PortraitForm } from './portrait-form';
import { BoundaryForm, ChimePrefsForm, FenceRulesForm, TendForm } from './ranch-forms';

export const metadata = { title: 'Workshop' };

/** The Workshop (settings). Protected: the session is checked on the server before any of this renders. */
export default async function WorkshopPage() {
  const user = await requireUser();
  const [ranch, prefs, lists, photo] = await Promise.all([
    getOwnRanch(user.id),
    getPrefs(user.id),
    listMyRelationships(user.id).then(withCards),
    getPortraitVersion(user.id).catch(() => null),
  ]);
  return (
    // The shell is applied here (not in a layout): /workshop/kit is a design gallery with its own navigation demo.
    <AppFrame>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 py-4 sm:gap-6 sm:py-8">
        <h1 className="text-heading text-text-primary">Workshop</h1>
        <PortraitForm
          displayName={ranch.displayName}
          portraitTint={ranch.portraitTint}
          portraitSrc={photo ? portraitUrl(user.handle, photo) : null}
        />
        <TendForm displayName={ranch.displayName} portraitTint={ranch.portraitTint} handle={user.handle} />
        <BoundaryForm
          ranchVisibility={ranch.ranchVisibility}
          signalVisibility={ranch.signalVisibility}
          official={ranch.verified}
        />
        <FenceRulesForm
          fenceVisibility={ranch.fenceVisibility}
          fencePosting={ranch.fencePosting}
          fenceReview={ranch.fenceReview}
        />
        <ChimePrefsForm initial={prefs} />
        <PeopleControls blocked={lists.blocked} muted={lists.muted} restricted={lists.restricted} />
      </main>
    </AppFrame>
  );
}
