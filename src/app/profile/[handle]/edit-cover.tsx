'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  COVER_HEIGHT_PX,
  COVER_WIDTH_PX,
  PORTRAIT_TYPES,
  coverUploadSchema,
} from '@/shared/validation/media';
import { COVER_PRESET_LABEL, COVER_PRESETS, type CoverPreset } from '@/shared/validation/profile';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { CoverSwatch, RanchCover } from '@/ui/howdy';
import { CameraIcon } from '@/ui/icons';
import { CoverCropper } from '@/ui/media/cover-cropper';
import { UploadBar } from '@/ui/media/upload-bar';
import { putWithProgress, usePhotoArrival, type SignedUpload } from '@/ui/media/upload-progress';
import { Button, buttonClasses, Modal, useToast } from '@/ui/primitives';

interface StartedUpload {
  mediaId: string;
  upload: SignedUpload;
}

/**
 * An upload's steps, as for a profile photo: `sending` (the bar fills with the real progress), `finishing` (the server
 * checks and stores it), `loading` (the stored cover is being fetched, so the preview stays until it can replace it
 * without a blank flash).
 */
type Uploading = 'sending' | 'finishing' | 'loading';
const UPLOADING: readonly string[] = ['sending', 'finishing', 'loading'] satisfies Uploading[];

/**
 * Your cover (ADR-051), changed on your profile: upload a photo or pick one of Howdy's covers. A chosen photo first opens
 * in a frame of the cover's shape, where you drag and zoom it to choose what shows (2026-11-07: people could not move or
 * resize it, and the server's centre crop cut off faces); Save cover sends exactly that frame. Picking a Howdy cover while
 * you have a photo removes the photo, so what you picked is what shows.
 */
export function EditCover({ preset, photoUrl }: { preset: CoverPreset; photoUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Uploading | 'removing' | CoverPreset | undefined>();
  const [progress, setProgress] = useState(0);
  // A chosen photo being placed in the frame, before anything is sent.
  const [adjusting, setAdjusting] = useState<File | undefined>();
  const [error, setError] = useState<string | undefined>();
  // The chosen file, shown at once, and the cover's address when it was chosen (see usePhotoArrival).
  const [preview, setPreview] = useState<{ url: string; against: string | null } | undefined>();

  // Free the temporary preview address when it is replaced or the editor goes away.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  // Everything else in the dialog (Remove, Howdy covers) waits until the stored cover has loaded and replaced the preview.
  usePhotoArrival(busy === 'loading', preview?.against, photoUrl, () => {
    setPreview(undefined);
    setBusy(undefined);
    toast({ title: 'Cover updated.', tone: 'success' });
  });

  function choose(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still triggers a change
    if (!picked) return;
    setError(undefined);
    if (!(PORTRAIT_TYPES as readonly string[]).includes(picked.type))
      return setError('Choose a JPEG, PNG or WebP photo.');
    setAdjusting(picked);
  }

  /** Save cover: the framed photo (a 1600 × 560 JPEG, so already small) goes up the usual way. */
  async function upload(photo: Blob) {
    const file = new File([photo], 'cover.jpg', { type: 'image/jpeg' });
    setAdjusting(undefined);
    setProgress(0);
    setBusy('sending');
    setPreview({ url: URL.createObjectURL(file), against: photoUrl });
    const checked = coverUploadSchema.safeParse({ contentType: file.type, size: file.size });
    if (!checked.success) return fail(checked.error.issues[0]?.message ?? 'We could not use that photo.');
    const start = await apiRequest<StartedUpload>('POST', '/api/me/cover', checked.data);
    if (!start.ok || !start.data)
      return fail(start.error?.fields?.contentType ?? start.error?.fields?.size ?? start.error?.message);
    try {
      if (!(await putWithProgress(start.data.upload, file, setProgress)))
        return fail('The photo did not upload. Please try again.');
    } catch {
      return fail('Could not reach the photo store. Check your connection and try again.');
    }
    setBusy('finishing');
    const done = await apiRequest('PUT', '/api/me/cover', { mediaId: start.data.mediaId });
    if (!done.ok) return fail(done.error?.fields?.file ?? done.error?.message);
    setBusy('loading');
    router.refresh();
  }

  function fail(message: string | undefined) {
    setPreview(undefined);
    setBusy(undefined);
    setError(message ?? 'That did not work. Please try again.');
  }

  async function removePhoto() {
    setError(undefined);
    setBusy('removing');
    const res = await apiRequest('DELETE', '/api/me/cover');
    if (!res.ok) return fail(res.error?.message);
    setBusy(undefined);
    toast({ title: 'Cover photo removed.', tone: 'success' });
    router.refresh();
  }

  async function pick(next: CoverPreset) {
    setError(undefined);
    setBusy(next);
    const res = await apiRequest('PATCH', '/api/me/porch', { coverPreset: next });
    if (!res.ok) return fail(res.error?.message);
    // A photo always wins over a Howdy cover, so picking one means not using the photo any more.
    if (photoUrl) {
      const gone = await apiRequest('DELETE', '/api/me/cover');
      if (!gone.ok) return fail(gone.error?.message);
    }
    setBusy(undefined);
    toast({ title: `Cover: ${COVER_PRESET_LABEL[next]}.`, tone: 'success' });
    router.refresh();
  }

  const uploading = busy !== undefined && UPLOADING.includes(busy);
  const shown = preview ? preview.url : photoUrl;
  const label =
    busy === 'sending'
      ? `Uploading ${Math.round(progress * 100)}%`
      : busy === 'finishing' || busy === 'loading'
        ? 'Finishing…'
        : photoUrl
          ? 'Change photo'
          : 'Upload a photo';
  // While a photo is being placed, the Howdy covers wait too: one choice at a time.
  const locked = Boolean(busy) || adjusting !== undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // On top of any cover (photo or gradient): a white pill with a shadow, always readable.
        className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-surface/95 px-3.5 text-caption font-semibold text-text-primary shadow-clay-sm hover:bg-surface pointer-fine:min-h-9"
      >
        <CameraIcon className="size-4" />
        Change cover
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your cover">
        <div className="flex flex-col gap-5">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <section className="flex flex-col gap-3">
            <h3 className="text-body font-semibold text-text-primary">Your photo</h3>
            {adjusting ? (
              <CoverCropper
                file={adjusting}
                width={COVER_WIDTH_PX}
                height={COVER_HEIGHT_PX}
                onCancel={() => setAdjusting(undefined)}
                onSave={(photo) => void upload(photo)}
              />
            ) : (
              <>
                {shown && (
                  <div className="relative overflow-hidden rounded-md">
                    <RanchCover photoUrl={shown} />
                    {uploading && (
                      <UploadBar
                        label="Uploading your cover"
                        progress={busy === 'sending' ? progress : null}
                      />
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {/* A real file input (keyboard and screen-reader friendly), dressed as a button. */}
                  <label
                    className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer tabular-nums has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus aria-disabled:cursor-not-allowed`}
                    aria-disabled={busy ? true : undefined}
                  >
                    <input
                      type="file"
                      accept={PORTRAIT_TYPES.join(',')}
                      onChange={choose}
                      disabled={Boolean(busy)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                  {photoUrl && !uploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removePhoto}
                      loading={busy === 'removing'}
                      disabled={Boolean(busy)}
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
                <p className="text-metadata text-text-muted">
                  JPEG, PNG or WebP. You choose which part shows before it is saved. Only people who can visit
                  your profile see it; location details are removed.
                </p>
              </>
            )}
          </section>
          <section className="flex flex-col gap-3 border-t border-border pt-5">
            <h3 id="howdy-covers" className="text-body font-semibold text-text-primary">
              Howdy covers
            </h3>
            <div
              role="radiogroup"
              aria-labelledby="howdy-covers"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {COVER_PRESETS.map((p) => {
                // While a photo is on its way (shown as the preview), no Howdy cover is the current one.
                const current = !shown && p === preset;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    disabled={locked}
                    onClick={() => void pick(p)}
                    className="flex flex-col gap-1.5 rounded-md text-left disabled:cursor-not-allowed"
                  >
                    <span
                      className={cn(
                        'block h-16 overflow-hidden rounded-md border',
                        current ? 'border-text-primary ring-2 ring-text-primary' : 'border-border',
                      )}
                    >
                      <CoverSwatch preset={p} />
                    </span>
                    <span className="text-caption text-text-primary">
                      {busy === p ? 'Saving…' : COVER_PRESET_LABEL[p]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </Modal>
    </>
  );
}
