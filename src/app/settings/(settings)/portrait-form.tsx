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
 * What the form is doing. `sending`: the file is travelling to storage (the ring fills with the real progress).
 * `finishing`: the server is decoding and cropping it. `loading`: the page has the new photo's address and the browser is
 * fetching it, so the preview stays up until the real photo can replace it without a blank flash.
 */
type Busy = 'sending' | 'finishing' | 'loading' | 'removing';

/** If the new photo never reports loaded (a dropped connection), stop waiting after this and let Save work again. */
const LOAD_WAIT_MS = 10_000;

/** Send the file with XHR rather than fetch: only XHR reports upload progress. Resolves true when storage said yes. */
function put(upload: StartedUpload['upload'], file: File, onProgress: (share: number) => void) {
  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(file);
  });
}

// The ring is drawn in a 76 × 76 box around the 64 px picture (6 px each side, outside its white edge).
const RING_R = 36;
const RING_C = 2 * Math.PI * RING_R;

/**
 * A ring around the picture while a photo uploads: it fills with the upload's real progress, then a short arc turns while
 * the server finishes. It always comes with words on the button too, so it is never the only sign of what is happening.
 */
function UploadRing({ progress }: { progress: number | null }) {
  const spinning = progress === null;
  return (
    <svg
      viewBox="0 0 76 76"
      role="progressbar"
      aria-label="Uploading your photo"
      aria-valuemin={0}
      aria-valuemax={100}
      {...(spinning ? {} : { 'aria-valuenow': Math.round(progress * 100) })}
      className={`pointer-events-none absolute -inset-1.5 size-[calc(100%+0.75rem)] -rotate-90 ${spinning ? 'animate-spin-slow' : ''}`}
    >
      <circle cx="38" cy="38" r={RING_R} fill="none" strokeWidth="3" className="stroke-border" />
      <circle
        cx="38"
        cy="38"
        r={RING_R}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        // Filling: the gap shrinks with progress. Spinning: a quarter arc goes round (the svg itself turns).
        strokeDashoffset={spinning ? RING_C * 0.75 : RING_C * (1 - Math.max(progress, 0.02))}
        className="stroke-star transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  );
}

/**
 * Choose, replace or remove your photo. The browser asks the server for a signed upload URL, sends the file straight to storage, then
 * asks the server to finish: the server decodes it, crops it square and stores a clean copy. Everything checked here (type, size) is
 * only a courtesy so mistakes fail fast; the server checks again and looks at the actual bytes.
 *
 * `onBusyChange` tells the surrounding editor while a photo is on its way, so its Save waits (2026-11-07: saving mid-upload
 * closed the dialog before the new photo had arrived, and it looked as if the photo had not been kept).
 */
export function PortraitForm({
  displayName,
  portraitTint,
  portraitSrc,
  bare = false,
  onBusyChange,
}: {
  displayName: string;
  portraitTint: PortraitTint;
  /** The current photo's address, or null when there is none (the coloured initials show instead). */
  portraitSrc: string | null;
  /** Inside another surface (the profile's edit dialog): no card of its own, a smaller heading. */
  bare?: boolean;
  /** Called with true when an upload or removal starts and false once the new photo is fully shown (or it failed). */
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<Busy | undefined>();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  // A local preview of the chosen file, and the address the photo had when it was chosen: once the page's address differs, the
  // new photo is live and only has to load.
  const [preview, setPreview] = useState<{ url: string; against: string | null } | undefined>();

  // Free the temporary preview address when it is replaced or the form goes away.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  useEffect(() => onBusyChange?.(busy !== undefined), [busy, onBusyChange]);

  // The last step: the refreshed page brought the new address. Fetch it in the background and swap the preview out only
  // when it has arrived, so the picture never goes blank between the two.
  const newSrc = busy === 'loading' && preview && portraitSrc !== preview.against ? portraitSrc : undefined;
  useEffect(() => {
    if (newSrc === undefined) return;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      setPreview(undefined);
      setBusy(undefined);
      toast({ title: 'Profile photo updated.', tone: 'success' });
    };
    const timer = window.setTimeout(done, LOAD_WAIT_MS);
    if (newSrc === null) done();
    else {
      const img = new Image();
      img.onload = done;
      img.onerror = done; // the real <img> will show its own fallback; Save must not stay locked
      img.src = newSrc;
    }
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [newSrc, toast]);

  // And if the refreshed page never brings a new address at all (its photo lookup failed), stop waiting too: the photo
  // is saved on the server either way.
  const waitingForPage = busy === 'loading';
  useEffect(() => {
    if (!waitingForPage) return;
    const timer = window.setTimeout(() => {
      setPreview(undefined);
      setBusy(undefined);
    }, LOAD_WAIT_MS * 2);
    return () => window.clearTimeout(timer);
  }, [waitingForPage]);

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
    setProgress(0);
    setBusy('sending');
    setPreview({ url: URL.createObjectURL(file), against: portraitSrc });

    const start = await apiRequest<StartedUpload>('POST', '/api/me/portrait', checked.data);
    if (!start.ok || !start.data)
      return fail(start.error?.fields?.contentType ?? start.error?.fields?.size ?? start.error?.message);

    try {
      if (!(await put(start.data.upload, file, setProgress)))
        return fail('The photo did not upload. Please try again.');
    } catch {
      return fail('Could not reach the photo store. Check your connection and try again.');
    }

    setBusy('finishing');
    const done = await apiRequest('PUT', '/api/me/portrait', { mediaId: start.data.mediaId });
    if (!done.ok) return fail(done.error?.fields?.file ?? done.error?.message);
    setBusy('loading');
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
    toast({ title: 'Profile photo removed.', tone: 'success' });
    router.refresh();
  }

  const uploading = busy === 'sending' || busy === 'finishing' || busy === 'loading';
  const shown = preview ? preview.url : portraitSrc;
  const label =
    busy === 'sending'
      ? `Uploading ${Math.round(progress * 100)}%`
      : busy === 'finishing' || busy === 'loading'
        ? 'Finishing…'
        : portraitSrc
          ? 'Change photo'
          : 'Add a photo';
  const accept = PORTRAIT_TYPES.join(',');
  // Settings: a card of its own. In the profile's "Edit your profile" dialog (`bare`): a section under the dialog's title.
  const Shell = bare ? 'section' : ClayCard;
  const Heading = bare ? 'h3' : 'h2';
  return (
    <Shell className="flex flex-col gap-3">
      <Heading
        className={bare ? 'text-body font-semibold text-text-primary' : 'text-title text-text-primary'}
      >
        Profile photo
      </Heading>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex items-center gap-5">
        <span className="relative inline-flex shrink-0">
          <Avatar name={displayName} src={shown} tint={portraitTint} size="lg" />
          {uploading && <UploadRing progress={busy === 'sending' ? progress : null} />}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {/* A real file input (keyboard and screen-reader friendly), dressed as a button. */}
          <label
            className={`${buttonClasses({ variant: 'secondary', size: 'sm' })} cursor-pointer tabular-nums has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus aria-disabled:cursor-not-allowed`}
            aria-disabled={busy ? true : undefined}
          >
            <input
              type="file"
              accept={accept}
              onChange={choose}
              disabled={Boolean(busy)}
              className="sr-only"
            />
            {label}
          </label>
          {portraitSrc && !uploading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              aria-label="Remove photo"
              loading={busy === 'removing'}
              disabled={Boolean(busy)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
      <p className="text-metadata text-text-muted">
        JPEG, PNG or WebP up to {PORTRAIT_MAX_BYTES / (1024 * 1024)} MB, cropped square. Only people who can
        visit your profile see it; location details are removed.
      </p>
    </Shell>
  );
}
