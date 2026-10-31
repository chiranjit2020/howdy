'use client';

import Link from 'next/link';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { PortraitForm } from '@/app/settings/(settings)/portrait-form';
import { TendForm } from '@/app/settings/(settings)/ranch-forms';
import type { PortraitTint } from '@/shared/validation/profile';
import { CameraIcon } from '@/ui/icons';
import { Button, Modal } from '@/ui/primitives';

const Open = createContext<(() => void) | null>(null);

/**
 * Editing your profile where you see it (your own profile only): "Edit your profile" and the camera on your picture both
 * open one dialog with your photo, name, bio and initials colour. The same forms, and the same server checks, as Settings;
 * privacy and the rest stay in Settings.
 */
export function EditProfile({
  children,
  displayName,
  bio,
  portraitTint,
  handle,
  portraitSrc,
}: {
  children: ReactNode;
  displayName: string;
  bio: string;
  portraitTint: PortraitTint;
  handle: string;
  portraitSrc: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Open.Provider value={() => setOpen(true)}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="Edit your profile">
        <div className="flex flex-col gap-5">
          <PortraitForm
            bare
            displayName={displayName}
            portraitTint={portraitTint}
            portraitSrc={portraitSrc}
          />
          <div className="border-t border-border pt-5">
            <TendForm
              bare
              displayName={displayName}
              bio={bio}
              portraitTint={portraitTint}
              handle={handle}
              onSaved={() => setOpen(false)}
            />
          </div>
          <p className="text-caption text-text-secondary">
            Who can see your profile, and everything else, is in{' '}
            <Link href="/settings" className="font-semibold">
              Settings
            </Link>
            .
          </p>
        </div>
      </Modal>
    </Open.Provider>
  );
}

/** The header's "Edit your profile" button. */
export function EditProfileButton() {
  const open = useContext(Open);
  return (
    <Button variant="secondary" onClick={() => open?.()}>
      Edit your profile
    </Button>
  );
}

/** The camera on your picture: changes your photo (the same dialog). */
export function EditPhotoButton() {
  const open = useContext(Open);
  return (
    <button
      type="button"
      onClick={() => open?.()}
      aria-label="Change your photo"
      // 44 px (36 with a mouse): a real target, sitting on the picture's edge with a ring of the card's white around it.
      className="grid size-11 place-items-center rounded-pill border-2 border-surface bg-surface-sunken text-text-primary shadow-clay-sm transition-colors hover:bg-border pointer-fine:size-9"
    >
      <CameraIcon className="size-5" />
    </button>
  );
}
