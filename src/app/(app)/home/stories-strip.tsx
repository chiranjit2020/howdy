'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { StoryRingItem } from '@/modules/stories';
import { STORY_CAPTION_MAX, type StoryAudience } from '@/shared/validation/stories';
import { postJson } from '@/ui/auth/api';
import { cn } from '@/ui/cn';
import { SendIcon } from '@/ui/icons';
import { uploadPhoto } from '@/ui/media/upload-photo';
import { Avatar, FullScreen, FullScreenClose, IconButton, useToast } from '@/ui/primitives';
import { StoryViewer } from './story-viewer';

const AUDIENCE_LABEL: Record<StoryAudience, string> = { pals: 'Friends', close: 'Close friends' };

/**
 * Stories on Home (ADR-047): a row of rings — mine first, then Pals with Stories for me (a pink ring = not seen yet).
 * Tapping opens the viewer; "Your Story" adds one. Each Story lasts 12 hours. `lead`: only my button, smaller and without
 * its caption, for the start of the "What's on your mind?" line when no friend has a Story (one circle is no row).
 */
export function StoriesStrip({
  initial,
  me,
  variant = 'row',
}: {
  variant?: 'row' | 'lead';
  initial: StoryRingItem[];
  me: {
    handle: string;
    displayName: string;
    portraitTint: StoryRingItem['person']['portraitTint'];
    portraitUrl?: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState<StoryRingItem | undefined>();
  const [file, setFile] = useState<File | undefined>();
  const picker = useRef<HTMLInputElement>(null);
  const startAdding = () => picker.current?.click();
  const mine = initial.find((r) => r.mine);
  const pals = initial.filter((r) => !r.mine);

  const close = () => {
    setOpen(undefined);
    router.refresh(); // rings turn from "unseen" to seen
  };

  const lead = variant === 'lead';
  const myButton = (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => (mine ? setOpen(mine) : startAdding())}
        aria-label={mine ? 'Your Story' : 'Add to your Story'}
        className={cn('block rounded-pill p-0.5', mine ? 'bg-border-strong' : 'bg-transparent')}
      >
        <Avatar name={me.displayName} tint={me.portraitTint} src={me.portraitUrl} size={lead ? 'md' : 'lg'} />
      </button>
      {!mine && (
        // Decoration only: the whole picture is the button (the badge alone would be too small to tap).
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute flex items-center justify-center rounded-pill border-2 border-surface bg-accent-strong leading-none font-bold text-on-accent shadow-clay-sm',
            lead ? '-right-0.5 -bottom-0.5 size-5 text-caption' : '-right-1 -bottom-1 size-7 text-title',
          )}
        >
          +
        </span>
      )}
    </div>
  );

  return (
    <section aria-label="Stories" className={lead ? 'shrink-0' : 'flex flex-col gap-2'}>
      {lead ? (
        myButton
      ) : (
        <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          <li className="shrink-0">
            <div className="flex w-20 flex-col items-center gap-1">
              {myButton}
              <span className="w-full truncate text-center text-metadata text-text-secondary">
                Your Story
              </span>
            </div>
          </li>
          {pals.map((r) => (
            <li key={r.person.handle} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpen(r)}
                aria-label={`${r.person.displayName}’s Story${r.unseen ? ', new' : ''}`}
                className="flex w-20 flex-col items-center gap-1"
              >
                {/* Unseen: violet into sunflower, like the rays on the icon (the violet half keeps it visible on white). */}
                <span
                  className={cn(
                    'rounded-pill',
                    r.unseen ? 'bg-linear-to-tr from-accent to-highlight p-[3px]' : 'bg-border p-0.5',
                  )}
                >
                  <Avatar
                    name={r.person.displayName}
                    tint={r.person.portraitTint}
                    src={r.person.portraitUrl}
                    size="lg"
                  />
                </span>
                <span className="w-full truncate text-center text-metadata text-text-secondary">
                  {r.person.displayName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <StoryViewer
          ring={open}
          onClose={close}
          onAdd={() => {
            setOpen(undefined);
            startAdding();
          }}
        />
      )}
      {/* Adding starts with the photo itself: the system picker opens straight away, no box before it. */}
      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = ''; // so the same file can be chosen again
          if (chosen) setFile(chosen);
        }}
      />
      {file && (
        <AddStory
          key={`${file.name}:${file.lastModified}`}
          file={file}
          onClose={() => setFile(undefined)}
          onPosted={() => {
            setFile(undefined);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

/**
 * Making a Story, after the photo is chosen: the photo itself, phone-shaped and full screen, with everything on it —
 * close and who sees it at the top, the caption typed onto the photo and a Share button at the bottom. The photo
 * uploads as soon as it opens; Share waits for it.
 */
function AddStory({ file, onClose, onPosted }: { file: File; onClose: () => void; onPosted: () => void }) {
  const toast = useToast();
  const captionId = useId();
  // A local address for the chosen file, made and freed by the same effect (so a remount never shows a freed one).
  const [preview, setPreview] = useState<string | undefined>();
  useEffect(() => {
    const url = URL.createObjectURL(file);
    queueMicrotask(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<StoryAudience>('pals');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const uploading = !photoId && !error;
  // Each attempt at uploading the photo (a failed one can be tried again without picking the photo again).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void uploadPhoto('/api/me/card-photo', file).then((res) => {
      if (!current) return;
      if (res.ok) setPhotoId(res.mediaId);
      else setError(res.message);
    });
    return () => {
      current = false;
    };
  }, [file, attempt]);

  function retryUpload() {
    setError(undefined);
    setAttempt((n) => n + 1);
  }

  async function share(e: FormEvent) {
    e.preventDefault();
    if (!photoId) return;
    setBusy(true);
    setError(undefined);
    const res = await postJson('/api/stories', {
      photoId,
      audience,
      ...(caption.trim() ? { caption } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      return setError(
        res.error?.fields?.caption ?? res.error?.fields?.photo ?? res.error?.message ?? 'That did not work.',
      );
    }
    toast({ title: 'Your Story is up for 12 hours.', tone: 'success' });
    onPosted();
  }

  return (
    <FullScreen open onClose={onClose} label="Add to your Story">
      <form
        onSubmit={share}
        noValidate
        className="relative aspect-[9/16] h-[min(calc(100dvh-2rem),44rem)] max-w-full overflow-hidden rounded-xl bg-island shadow-float"
      >
        {/* Exactly what friends will see (story-viewer.tsx draws it the same way): the whole photo, never cropped, on
            a soft blurred copy of itself. Nothing is cut off, so there is nothing to drag or pinch into place. */}
        {preview && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
            <img
              src={preview}
              alt=""
              className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-2xl"
            />
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
            <img
              src={preview}
              alt="The photo for your Story"
              className={cn(
                'absolute inset-0 size-full object-contain transition-opacity',
                uploading && 'opacity-60',
              )}
            />
          </>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-linear-to-b from-island/70 to-transparent p-3">
          <FullScreenClose onClick={onClose} />
          <fieldset>
            <legend className="sr-only">Who sees it</legend>
            <div className="flex rounded-pill bg-island/60 p-0.5 backdrop-blur">
              {(['pals', 'close'] as const).map((a) => (
                <label
                  key={a}
                  className={cn(
                    // 44 px tall for fingers, compact with a mouse.
                    'flex min-h-11 cursor-pointer items-center rounded-pill px-3 text-metadata font-semibold transition-colors pointer-fine:min-h-8 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
                    audience === a ? 'bg-surface text-text-primary' : 'text-on-island',
                  )}
                >
                  <input
                    type="radio"
                    name="story-audience"
                    value={a}
                    checked={audience === a}
                    onChange={() => setAudience(a)}
                    className="sr-only"
                  />
                  {AUDIENCE_LABEL[a]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {uploading && (
          <p
            role="status"
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-caption font-semibold text-on-island"
          >
            Uploading…
          </p>
        )}
        {/* Calm and with a way forward: an upload that failed can be tried again right here. */}
        {error && (
          <div
            role="alert"
            className="absolute inset-x-3 top-16 flex items-center justify-between gap-3 rounded-md bg-danger px-3 py-2 text-caption text-on-danger"
          >
            <span>{error}</span>
            {!photoId && (
              <button
                type="button"
                onClick={retryUpload}
                className="min-h-11 shrink-0 font-semibold underline underline-offset-2 pointer-fine:min-h-0"
              >
                Try again
              </button>
            )}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-island/80 to-transparent p-3 pt-12">
          <label htmlFor={captionId} className="sr-only">
            Caption
          </label>
          <input
            id={captionId}
            data-autofocus
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={STORY_CAPTION_MAX}
            placeholder="Add a caption…"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-pill bg-island/50 px-4 text-body text-on-island backdrop-blur placeholder:text-on-island-muted focus:ring-2 focus:ring-primary/70 focus:outline-none"
          />
          <IconButton
            type="submit"
            tone="accent"
            label="Share to your Story"
            disabled={!photoId || busy}
            aria-busy={busy || undefined}
          >
            <SendIcon className="size-5" />
          </IconButton>
        </div>
      </form>
    </FullScreen>
  );
}
