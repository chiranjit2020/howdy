'use client';

import { useState } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { PortraitForm } from './portrait-form';
import { TendForm } from './ranch-forms';

/**
 * Your photo, then your name, bio and colour: the same pair in Settings › Profile and the profile's "Edit your profile"
 * dialog. It links the two so Save waits while a new photo is still uploading.
 */
export function ProfileEditor({
  displayName,
  bio,
  portraitTint,
  handle,
  portraitSrc,
  onSaved,
}: {
  displayName: string;
  bio: string;
  portraitTint: PortraitTint;
  handle: string;
  portraitSrc: string | null;
  onSaved?: () => void;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  return (
    <>
      <PortraitForm
        bare
        displayName={displayName}
        portraitTint={portraitTint}
        portraitSrc={portraitSrc}
        onBusyChange={setPhotoBusy}
      />
      <div className="border-t border-border pt-5">
        <TendForm
          bare
          displayName={displayName}
          bio={bio}
          portraitTint={portraitTint}
          handle={handle}
          waitingForPhoto={photoBusy}
          {...(onSaved ? { onSaved } : {})}
        />
      </div>
    </>
  );
}
