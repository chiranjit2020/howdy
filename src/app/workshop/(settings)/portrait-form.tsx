'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { PORTRAIT_MAX_BYTES, PORTRAIT_TYPES, portraitUploadSchema } from '@/shared/validation/media';
import { apiRequest } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Avatar, Button, buttonClasses, ClayCard, useToast } from '@/ui/primitives';

interface StartedUpload {
  mediaId: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

/**
 * Choose, replace or remove your photo. The browser asks the server for a signed upload URL, sends the file straight to storage, then
 * asks the server to finish: the server decodes it, crops it square and stores a clean copy. Everything checked here (type, size) is
 * only a courtesy so mistakes fail fast; the server checks again and looks at the actual bytes.
 */
export function PortraitForm({
  displayName,
  portraitTint,
  portraitSrc,
}: {
  displayName: string;
  portraitTint: PortraitTint;
  /** The current photo's address, or null when there is none (the coloured initials show instead). */
  portraitSrc: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'uploading' | 'removing' | undefined>();
  const [error, setError] = useState<string | undefined>();
  // A local preview of the chosen file, tied to the server address it was chosen against. When the server's address changes (the new
  // photo is live and the page refreshed) the preview no longer matches and simply stops being used: no effect has to clear it.
  const [preview, setPreview] = useState<{ url: string; against: string | null } | undefined>();

  // Free the temporary preview address when it is replaced or the form goes away.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still triggers a change
    if (!file) return;
    setError(undefined);
    const checked = portraitUploadSchema.safeParse({ contentType: file.type, size: file.size });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'We could not use that photo.');
      return;
    }
    setBusy('uploading');
    setPreview({ url: URL.createObjectURL(file), against: portraitSrc });

    const start = await apiRequest<StartedUpload>('POST', '/api/me/portrait', checked.data);
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

    const done = await apiRequest('PUT', '/api/me/portrait', { mediaId: start.data.mediaId });
    if (!done.ok) return fail(done.error?.fields?.file ?? done.error?.message);
    setBusy(undefined);
    toast({ title: 'Portrait updated.', tone: 'success' });
    router.refresh();
  }

  function fail(message: string | undefined) {
    setPreview(undefined);
    setBusy(undefined);
    setError(message ?? 'That did not work. Please try again.');
  }

  async function remove() {
    setError(undefined);
    setBusy('removing');
    const res = await apiRequest('DELETE', '/api/me/portrait');
    setBusy(undefined);
    if (!res.ok) return setError(res.error?.message ?? 'That did not work. Please try again.');
    setPreview(undefined);
    toast({ title: 'Portrait removed.', tone: 'success' });
    router.refresh();
  }

  const shown = preview && preview.against === portraitSrc ? preview.url : portraitSrc;
  const accept = PORTRAIT_TYPES.join(',');
  return (
    <ClayCard className="flex flex-col gap-4">
      <h2 className="text-title text-text-primary">Portrait</h2>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={displayName} src={shown} tint={portraitTint} size="xl" />
        <div className="flex flex-col gap-2">
          {/* A real file input (keyboard and screen-reader friendly), dressed as a button. */}
          <label
            className={`${buttonClasses({ variant: 'secondary' })} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus aria-disabled:cursor-not-allowed`}
            aria-disabled={busy ? true : undefined}
          >
            <input
              type="file"
              accept={accept}
              onChange={choose}
              disabled={Boolean(busy)}
              className="sr-only"
            />
            {busy === 'uploading' ? 'Uploading…' : portraitSrc ? 'Choose a new photo' : 'Choose a photo'}
          </label>
          {portraitSrc && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              loading={busy === 'removing'}
              disabled={Boolean(busy)}
            >
              Remove photo
            </Button>
          )}
        </div>
      </div>
      <p className="text-metadata text-text-muted">
        JPEG, PNG or WebP, up to {PORTRAIT_MAX_BYTES / (1024 * 1024)} MB. It is cropped to a square. Only
        people who can visit your Porch can see it, and location details in the photo are removed.
      </p>
    </ClayCard>
  );
}
