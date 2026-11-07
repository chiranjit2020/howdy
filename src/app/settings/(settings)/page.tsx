import { requireUser } from '@/modules/auth';
import { getPortraitVersion } from '@/modules/media';
import { getOwnRanch } from '@/modules/profiles';
import { portraitUrl } from '@/shared/portrait';
import { ClayCard } from '@/ui/primitives';
import { ProfileEditor } from './profile-editor';

export const metadata = { title: 'Settings' };

/**
 * Settings › Profile: your photo, name, bio and photo colour in one card (the same parts as "Edit your profile" on the
 * profile itself). Protected: the session is checked on the server before any of this renders.
 */
export default async function ProfileSettingsPage() {
  const user = await requireUser();
  const [ranch, photo] = await Promise.all([
    getOwnRanch(user.id),
    getPortraitVersion(user.id, { userId: user.id }).catch(() => null),
  ]);
  return (
    <ClayCard className="flex flex-col gap-5">
      <h2 className="text-title text-text-primary">Your profile</h2>
      <ProfileEditor
        displayName={ranch.displayName}
        bio={ranch.bio ?? ''}
        portraitTint={ranch.portraitTint}
        handle={user.handle}
        portraitSrc={photo ? portraitUrl(user.handle, photo) : null}
      />
    </ClayCard>
  );
}
