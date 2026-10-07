'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { StoryItem, StoryRingItem } from '@/modules/stories';
import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { STORY_CAPTION_MAX, type StoryAudience } from '@/shared/validation/stories';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { REACTION_LABEL, ReactionArt } from '@/ui/howdy';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { RelativeTime } from '@/ui/howdy/time';
import { uploadPhoto } from '@/ui/media/upload-photo';
import { Avatar, Button, ConfirmationDialog, Input, Modal, Select, useToast } from '@/ui/primitives';

/** A Story moves on by itself after this long, unless the person is doing something with it. */
const ADVANCE_MS = 6000;

type Wire = StoryItem;

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

/** One person's Stories, one at a time: tap Next / Previous, or let it move on. */
function StoryViewer({
  ring,
  onClose,
  onAdd,
}: {
  ring: StoryRingItem;
  onClose: () => void;
  /** Mine only: add another Story. */
  onAdd: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<Wire[] | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    let live = true;
    void apiRequest<{ stories: Wire[] }>('GET', `/api/porch/${ring.person.handle}/stories`).then((res) => {
      if (!live) return;
      if (res.ok && res.data) setItems(res.data.stories);
      else setError('This Story is no longer here.');
    });
    return () => {
      live = false;
    };
  }, [ring.person.handle]);

  const story = items?.[index];

  // Opening a Story records that I saw it (once); who may know is decided on the server.
  useEffect(() => {
    if (!story || story.mine || viewed.current.has(story.id)) return;
    viewed.current.add(story.id);
    void postJson(`/api/stories/${story.id}/view`, {});
  }, [story]);

  const next = useCallback(() => {
    if (!items) return;
    if (index + 1 < items.length) setIndex(index + 1);
    else onClose();
  }, [index, items, onClose]);

  useEffect(() => {
    if (!story || paused) return;
    const t = setTimeout(next, ADVANCE_MS);
    return () => clearTimeout(t);
  }, [story, paused, next]);

  async function react(kind: ReactionKind) {
    if (!story) return;
    setPaused(true);
    const to = story.myReaction === kind ? null : kind;
    const res = await postJson<{ myReaction: ReactionKind | null }>(`/api/stories/${story.id}/react`, {
      kind: to,
    });
    if (res.ok && res.data) {
      const mine = res.data.myReaction;
      setItems((all) => all && all.map((s) => (s.id === story.id ? { ...s, myReaction: mine } : s)));
    } else setError(res.error?.message ?? 'That did not work.');
  }

  async function remove() {
    if (!story) return;
    const res = await apiRequest('DELETE', `/api/stories/${story.id}`);
    setDeleting(false);
    if (!res.ok) return setError(res.error?.message ?? 'That did not work.');
    toast({ title: 'Story taken down.', tone: 'success' });
    const left = items!.filter((s) => s.id !== story.id);
    if (left.length === 0) return onClose();
    setItems(left);
    setIndex(Math.min(index, left.length - 1));
  }

  const replyHref = story
    ? `/whispers/${ring.person.handle}?draft=${encodeURIComponent(
        `Replying to your Story${story.caption ? ` (“${story.caption}”)` : ''}: `,
      )}`
    : '#';

  return (
    <Modal open onClose={onClose} title={ring.mine ? 'Your Story' : `${ring.person.displayName}’s Story`}>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {!items && !error && <p className="text-caption text-text-secondary">Opening…</p>}
      {story && items && (
        <div className="flex flex-col gap-3">
          {/* One bar per Story; the current one is filled. */}
          <div className="flex gap-1" aria-hidden="true">
            {items.map((s, i) => (
              <span
                key={s.id}
                className={cn('h-1 flex-1 rounded-pill', i <= index ? 'bg-accent' : 'bg-border')}
              />
            ))}
          </div>
          <p className="text-caption text-text-secondary">
            {index + 1} of {items.length} · <RelativeTime date={story.postedAt} />
            {story.audience === 'close' && ' · Close Pals only'}
          </p>
          <figure className="relative overflow-hidden rounded-lg bg-island">
            <Img
              src={story.photo.url}
              width={story.photo.width}
              height={story.photo.height}
              alt={
                story.caption
                  ? `Story photo: ${story.caption}`
                  : `A Story photo from ${ring.person.displayName}`
              }
              loading="eager"
              className="max-h-[55vh] w-full object-contain"
            />
            {story.caption && (
              <figcaption className="absolute inset-x-0 bottom-0 bg-island/70 px-3 py-2 text-body font-medium text-on-island">
                {story.caption}
              </figcaption>
            )}
          </figure>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIndex(Math.max(0, index - 1))}
              disabled={index === 0}
            >
              Previous
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Play' : 'Pause'}
            </Button>
            <Button size="sm" variant="secondary" onClick={next}>
              {index + 1 < items.length ? 'Next' : 'Done'}
            </Button>
          </div>

          {!story.mine && (
            <>
              <div
                role="group"
                aria-label="React to this Story"
                className="flex flex-wrap justify-center gap-1"
              >
                {REACTION_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => react(k)}
                    aria-pressed={story.myReaction === k}
                    aria-label={REACTION_LABEL[k]}
                    className={cn(
                      'inline-flex size-11 items-center justify-center rounded-pill',
                      story.myReaction === k
                        ? 'bg-accent-soft shadow-clay-pressed'
                        : 'hover:bg-surface-sunken',
                    )}
                  >
                    <ReactionArt kind={k} className="size-7" />
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={replyHref} className="inline-flex min-h-11 items-center text-body font-semibold">
                  Reply in a Whisper
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPaused(true);
                    setReporting(true);
                  }}
                >
                  Flag…
                </Button>
              </div>
            </>
          )}

          {story.mine && (
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => {
                  setPaused(true);
                  setShowViewers((v) => !v);
                }}
                aria-expanded={showViewers}
              >
                {story.viewers ? `Seen by ${story.viewers.length}` : 'Reactions'}
                {story.reactions &&
                  story.reactions.length > 0 &&
                  (story.viewers
                    ? ` · ${story.reactions.length} more reacted`
                    : ` · ${story.reactions.length}`)}
              </Button>
              {showViewers && (
                <ul className="flex flex-col gap-2">
                  {[...(story.viewers ?? []), ...(story.reactions ?? [])].map((v) => (
                    <li key={v.person.handle} className="flex items-center gap-2">
                      <Avatar
                        name={v.person.displayName}
                        tint={v.person.portraitTint}
                        src={v.person.portraitUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-body text-text-primary">
                        {v.person.displayName}
                      </span>
                      {v.reaction && (
                        <>
                          <ReactionArt kind={v.reaction} className="size-6" />
                          <span className="sr-only">reacted {REACTION_LABEL[v.reaction]}</span>
                        </>
                      )}
                    </li>
                  ))}
                  {story.viewers && story.viewers.length === 0 && (story.reactions?.length ?? 0) === 0 && (
                    <li className="text-caption text-text-secondary">
                      Nobody yet — or only people who keep their Story views to themselves.
                    </li>
                  )}
                  {!story.viewers && (
                    <li className="text-caption text-text-secondary">
                      Your Story views are off, so you do not see who viewed. Turn them on in the Workshop.
                    </li>
                  )}
                </ul>
              )}
              <Button size="sm" variant="secondary" className="self-start" onClick={onAdd}>
                Add another Story
              </Button>
              <Button
                size="sm"
                variant="danger"
                className="self-start"
                onClick={() => {
                  setPaused(true);
                  setDeleting(true);
                }}
              >
                Take this Story down
              </Button>
            </div>
          )}
        </div>
      )}
      {story && (
        <>
          <ReportDialog
            open={reporting}
            title="Flag this Story"
            endpoint={`/api/reports/story/${story.id}`}
            onClose={() => setReporting(false)}
            onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
          />
          <ConfirmationDialog
            open={deleting}
            destructive
            title="Take this Story down?"
            description="It disappears for everyone right away."
            confirmLabel="Take it down"
            onCancel={() => setDeleting(false)}
            onConfirm={remove}
          />
        </>
      )}
    </Modal>
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
          <div className="relative self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
            <img
              src={photo.preview}
              alt="The photo you chose for your Story"
              className={cn('max-h-60 rounded-md object-contain', uploading && 'opacity-60')}
            />
            {uploading && <p className="text-metadata text-text-secondary">Uploading…</p>}
            <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto(undefined)}>
              Choose another
            </Button>
          </div>
        ) : (
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong bg-surface-sunken p-4 text-center">
            <span className="text-body font-semibold text-text-primary">Choose a photo</span>
            <span className="text-caption text-text-secondary">JPEG, PNG or WebP, up to 5 MB</span>
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
        <Select
          label="Who sees it"
          value={audience}
          onChange={(e) => setAudience(e.target.value as StoryAudience)}
        >
          <option value="pals">All my Pals</option>
          <option value="close">Close Pals only</option>
        </Select>
        <Button type="submit" loading={busy} disabled={uploading || !photo?.id} className="self-start">
          Share to Story
        </Button>
      </form>
    </Modal>
  );
}
