import { requireUser } from '@/modules/auth';
import { getOwnRanch } from '@/modules/profiles';
import { ClayCard } from '@/ui/primitives';
import { ReadReceipts } from '../read-receipts';
import { BoundaryForm, FenceRulesForm, StoryViewsForm } from '../ranch-forms';

export const metadata = { title: 'Privacy settings' };

/**
 * Settings › Privacy: who can see you and your wall, and the two "both ways" switches (Story views, Read receipts).
 * Everything here saves as you change it.
 */
export default async function PrivacySettingsPage() {
  const user = await requireUser();
  const ranch = await getOwnRanch(user.id);
  return (
    <>
      <BoundaryForm
        ranchVisibility={ranch.ranchVisibility}
        discoverable={ranch.discoverable}
        searchable={ranch.searchable}
        official={ranch.verified}
      />
      <FenceRulesForm
        fenceVisibility={ranch.fenceVisibility}
        fencePosting={ranch.fencePosting}
        fenceReview={ranch.fenceReview}
      />
      <ClayCard className="flex flex-col gap-3">
        <h2 className="text-title text-text-primary">Seen and viewed</h2>
        <StoryViewsForm bare initial={ranch.storyViews} />
        <ReadReceipts bare initial={ranch.readReceipts} />
      </ClayCard>
    </>
  );
}
