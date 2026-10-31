'use client';

import { useRouter } from 'next/navigation';
import { useState, type ChangeEvent } from 'react';
import { PORTRAIT_TYPES, coverUploadSchema } from '@/shared/validation/media';
import { COVER_PRESET_LABEL, COVER_PRESETS, type CoverPreset } from '@/shared/validation/profile';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { CoverSwatch, RanchCover } from '@/ui/howdy';
import { CameraIcon } from '@/ui/icons';
import { Button, buttonClasses, Modal, useToast } from '@/ui/primitives';

interface StartedUpload {
  mediaId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/**
 * Your cover (ADR-051), changed on your profile: upload a photo (the same steps and checks as a profile photo, cropped to
 * a wide banner) or pick one of Howdy's covers. Picking a Howdy cover while you have a photo removes the photo, so what
 * you picked is what shows.
 */
export function EditCover({ preset, photoUrl }: { preset: CoverPreset; photoUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'uploading' | 'removing' | CoverPreset | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still triggers a change
    if (!file) return;
    setError(undefined);
    const checked = coverUploadSchema.safeParse({ contentType: file.type, size: file.size });
    if (!checked.success) return setError(checked.error.issues[0]?.message ?? 'We could not use that photo.');
    setBusy('uploading');
    const start = await apiRequest<StartedUpload>('POST', '/api/me/cover', checked.data);
    if (!start.ok || !start.data)
      return fail(start.error?.fields?.contentType ?? start.error?.fields?.size ?? start.error?.message);
    try {
      const sent = await fetch(start.data.upload.url, {
        method: start.data.upload.method,
        headers: start.data.upload.headers,
        body: file,
      });
      if (!sent.ok) return fail('The photo did not upload. Please try again.');
    } catch {
      return fail('Could not reach the photo store. Check your connection and try again.');
    }
    const done = await apiRequest('PUT', '/api/me/cover', { mediaId: start.data.mediaId });
    if (!done.ok) return fail(done.error?.fields?.file ?? done.error?.message);
    setBusy(undefined);
    toast({ title: 'Cover updated.', tone: 'success' });
    router.refresh();
  }

  function fail(message: string | undefined) {
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
            {photoUrl && <RanchCover photoUrl={photoUrl} className="rounded-md" />}
            <div className="flex flex-wrap items-center gap-2">
              {/* A real file input (keyboard and screen-reader friendly), dressed as a button. */}
              <label
                className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus aria-disabled:cursor-not-allowed`}
                aria-disabled={busy ? true : undefined}
              >
                <input
                  type="file"
                  accept={PORTRAIT_TYPES.join(',')}
                  onChange={choose}
                  disabled={Boolean(busy)}
                  className="sr-only"
                />
                {busy === 'uploading' ? 'Uploading…' : photoUrl ? 'Change photo' : 'Upload a photo'}
              </label>
              {photoUrl && (
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
              JPEG, PNG or WebP up to 5 MB, cropped to a wide banner. Only people who can visit your profile
              see it; location details are removed.
            </p>
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
                const current = !photoUrl && p === preset;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={current}
                    disabled={Boolean(busy)}
                    onClick={() => void pick(p)}
                    className="flex flex-col gap-1.5 rounded-md text-left disabled:cursor-wait"
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
