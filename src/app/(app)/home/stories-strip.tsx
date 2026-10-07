'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { StoryRingItem } from '@/modules/stories';
import { STORY_CAPTION_MAX, type StoryAudience } from '@/shared/validation/stories';
import { postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { uploadPhoto } from '@/ui/media/upload-photo';
import { Avatar, Button, Input, Modal, useToast } from '@/ui/primitives';
import { StoryViewer } from './story-viewer';

const AUDIENCE_LABEL: Record<StoryAudience, string> = { pals: 'All my Pals', close: 'Close Pals only' };

/**
 * Stories on Home (ADR-047): a row of rings — mine first, then Pals with Stories for me (a pink ring = not seen yet).
 * Tapping opens the viewer; "Your Story" adds one. Each Story lasts 12 hours.
 */
export function StoriesStrip({
  initial,
  me,
}: {
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
  const [adding, setAdding] = useState(false);
  const mine = initial.find((r) => r.mine);
  const pals = initial.filter((r) => !r.mine);

  const close = () => {
    setOpen(undefined);
    router.refresh(); // rings turn from "unseen" to seen
  };

  return (
    <section aria-label="Stories" className="flex flex-col gap-2">
      <ul className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        <li className="shrink-0">
          <div className="flex w-20 flex-col items-center gap-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => (mine ? setOpen(mine) : setAdding(true))}
                aria-label={mine ? 'Your Story' : 'Add to your Story'}
                className={cn('rounded-pill p-0.5', mine ? 'bg-border-strong' : 'bg-transparent')}
              >
                <Avatar name={me.displayName} tint={me.portraitTint} src={me.portraitUrl} size="lg" />
              </button>
              {!mine && (
                // Decoration only: the whole picture is the button (a 28 px badge would be too small to tap).
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-pill border-2 border-surface bg-accent text-title leading-none font-bold text-on-accent shadow-clay-sm"
                >
                  +
                </span>
              )}
            </div>
            <span className="w-full truncate text-center text-metadata text-text-secondary">Your Story</span>
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
              <span className={cn('rounded-pill p-0.5', r.unseen ? 'bg-accent' : 'bg-border')}>
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
      {initial.length === 0 && (
        <p className="text-caption text-text-secondary">
          Share a photo with your Pals for 12 hours — tap your picture above.
        </p>
      )}
      {open && (
        <StoryViewer
          ring={open}
          onClose={close}
          onAdd={() => {
            setOpen(undefined);
            setAdding(true);
          }}
        />
      )}
      <AddStory
        open={adding}
        onClose={() => setAdding(false)}
        onPosted={() => {
          setAdding(false);
          router.refresh();
        }}
      />
    </section>
  );
}

/** Add a Story: choose a photo, an optional caption, and who sees it. */
function AddStory({ open, onClose, onPosted }: { open: boolean; onClose: () => void; onPosted: () => void }) {
  const toast = useToast();
  const [photo, setPhoto] = useState<{ preview: string; id?: string } | undefined>();
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<StoryAudience>('pals');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const uploading = photo !== undefined && photo.id === undefined;

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    const preview = URL.createObjectURL(file);
    setPhoto({ preview });
    const res = await uploadPhoto('/api/me/card-photo', file);
    if (res.ok) setPhoto((p) => (p?.preview === preview ? { preview, id: res.mediaId } : p));
    else {
      setPhoto(undefined);
      setError(res.message);
    }
  }

  async function share(e: FormEvent) {
    e.preventDefault();
    if (!photo?.id) return setError('Choose a photo first.');
    setBusy(true);
    setError(undefined);
    const res = await postJson('/api/stories', {
      photoId: photo.id,
      audience,
      ...(caption.trim() ? { caption } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      return setError(
        res.error?.fields?.caption ?? res.error?.fields?.photo ?? res.error?.message ?? 'That did not work.',
      );
    }
    setPhoto(undefined);
    setCaption('');
    toast({ title: 'Your Story is up for 12 hours.', tone: 'success' });
    onPosted();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add to your Story" description="One photo, for 12 hours.">
      <form onSubmit={share} noValidate className="flex flex-col gap-3">
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {photo ? (
          <div className="flex flex-col items-center gap-1">
            {/* A phone-shaped preview, caption and all, the way Pals will see it. */}
            <div className="relative aspect-[9/16] w-32 overflow-hidden rounded-lg bg-island shadow-clay-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
              <img
                src={photo.preview}
                alt="The photo you chose for your Story"
                className={cn('size-full object-cover', uploading && 'opacity-50')}
              />
              {uploading && (
                <p className="absolute inset-0 flex items-center justify-center text-caption font-semibold text-on-island">
                  Uploading…
                </p>
              )}
              {caption.trim() && (
                <p className="absolute inset-x-0 bottom-0 bg-linear-to-t from-island/80 to-transparent px-2 pt-6 pb-2 text-center text-metadata font-medium text-on-island [overflow-wrap:anywhere]">
                  {caption}
                </p>
              )}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto(undefined)}>
              Change photo
            </Button>
          </div>
        ) : (
          <label className="mx-auto flex aspect-[9/16] w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong bg-surface-sunken p-3 text-center hover:border-accent">
            <span className="text-body font-semibold text-text-primary">Choose a photo</span>
            <span className="text-metadata text-text-secondary">JPEG, PNG or WebP, up to 5 MB</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => void choose(e.target.files?.[0])}
            />
          </label>
        )}
        <Input
          label="Caption (optional)"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={STORY_CAPTION_MAX}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-caption font-semibold text-text-primary">Who sees it</legend>
          <div className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunken p-1">
            {(['pals', 'close'] as const).map((a) => (
              <label
                key={a}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-pill px-2 text-center text-caption font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
                  audience === a ? 'bg-surface text-text-primary shadow-clay-sm' : 'text-text-secondary',
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
        <Button type="submit" loading={busy} disabled={uploading || !photo?.id}>
          Share to Story
        </Button>
      </form>
    </Modal>
  );
}
