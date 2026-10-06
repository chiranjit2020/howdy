'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { LIMITS } from '@/shared/limits';
import type { ReactionKind } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { Art } from '../art/glyph';
import { Img } from '../art/img';
import { cn } from '../cn';
import { FlipIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { Button } from '../primitives/button';
import { Textarea } from '../primitives/field';
import { FormMessage } from '../auth/form-parts';
import type { PhotoUpload } from '../media/upload-photo';
import { RelativeTime } from './time';
import { NameBadge } from './verified-badge';
import { ReactionBar, ReactionSummary } from './reactions';

export interface PostCardAuthor {
  name: string;
  handle: string;
  tint?: PortraitTint;
  avatarUrl?: string | null;
  /** The Howdy team account: the Verified badge follows the name. */
  verified?: boolean;
  /** Has earned the Trusted tick. */
  trusted?: boolean;
}

/** One scribble on the back of a Post Card (max 80 chars, enforced server-side). */
export function PostCardReply({
  author,
  body,
  createdAt,
  notice,
  actions,
}: {
  author: PostCardAuthor;
  body: string;
  createdAt: Date | string;
  /** Short honest status such as "Waiting for approval". Plain text only. */
  notice?: string;
  /** Per-reply actions (e.g. a Remove button). */
  actions?: ReactNode;
}) {
  return (
    <li className="flex gap-2.5">
      <Avatar
        name={author.name}
        src={author.avatarUrl}
        {...(author.tint ? { tint: author.tint } : {})}
        size="sm"
      />
      <div className="min-w-0">
        <p className="text-metadata [overflow-wrap:anywhere] text-text-muted">
          <span className="font-semibold text-text-secondary">
            @{author.handle}
            <NameBadge verified={author.verified} trusted={author.trusted} className="ml-0.5" />
          </span>{' '}
          · <RelativeTime date={createdAt} />
        </p>
        <p className="text-caption font-normal break-words text-text-primary">{body}</p>
        {notice && <p className="text-metadata text-text-muted">{notice}</p>}
        {actions}
      </div>
    </li>
  );
}

/** What a composer writes: a Post Card, a reply on one, or a post in a Town Hall's feed (ADR-033). */
const COMPOSER = {
  card: {
    max: LIMITS.POST_CARD_MAX,
    label: 'Nail a Post Card',
    placeholder: 'Short and sweet…',
    rows: 3,
    art: 'nav-nail',
    submit: 'Nail to Fence',
  },
  reply: {
    max: LIMITS.REPLY_MAX,
    label: 'Scribble a reply',
    placeholder: 'One or two lines. Longer? Take it to a Whisper.',
    rows: 2,
    art: 'nav-scribble',
    submit: 'Scribble',
  },
  post: {
    max: LIMITS.TOWNHALL_POST_MAX,
    label: 'Post to this Town Hall',
    placeholder: 'Say howdy, ask something, share news…',
    rows: 3,
    art: 'nav-town-halls',
    submit: 'Post',
  },
} as const;

/**
 * Composer for a Post Card (160), a reply (80) or a Town Hall post (280). Limits come from LIMITS; the server is the authority. A card composer
 * given `onPhoto` also offers one photo (ADR-031): it uploads as soon as it is chosen, shows a local preview, and its id
 * goes with the words when the card is nailed.
 */
export function PostCardComposer({
  kind,
  onSubmit,
  onPhoto,
  disabled,
}: {
  kind: keyof typeof COMPOSER;
  /** Return `false` to keep what was typed (e.g. the server refused it); anything else clears the box. */
  onSubmit: (body: string, photoId?: string) => boolean | void | Promise<boolean | void>;
  /** Upload a chosen photo; only offered when given (the server decides who may add one). */
  onPhoto?: (file: File) => Promise<PhotoUpload>;
  disabled?: boolean;
}) {
  const { max, label, placeholder, rows, art, submit: submitLabel } = COMPOSER[kind];
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ preview: string; id?: string } | undefined>();
  const [photoError, setPhotoError] = useState<string | undefined>();
  const uploading = photo !== undefined && photo.id === undefined;
  const trimmed = body.trim();

  // Free the temporary preview address when it is replaced or the composer goes away.
  const previewUrl = photo?.preview;
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still triggers a change
    if (!file || !onPhoto) return;
    setPhotoError(undefined);
    const preview = URL.createObjectURL(file);
    setPhoto({ preview });
    const res = await onPhoto(file);
    if (res.ok) setPhoto((p) => (p?.preview === preview ? { preview, id: res.mediaId } : p));
    else {
      setPhoto(undefined);
      setPhotoError(res.message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy || uploading) return;
    setBusy(true);
    try {
      const ok = await onSubmit(trimmed, photo?.id);
      if (ok !== false) {
        setBody('');
        setPhoto(undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        label={label}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={max}
        showCount
        rows={rows}
        placeholder={placeholder}
      />
      {photoError && <FormMessage tone="error">{photoError}</FormMessage>}
      {photo && (
        <div className="relative self-start">
          {/* A local preview (blob:) of the chosen file, before or while it uploads. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
          <img
            src={photo.preview}
            alt={`The photo you chose for this ${kind === 'post' ? 'post' : 'card'}`}
            className={cn('max-h-40 rounded-md object-contain', uploading && 'opacity-60')}
          />
          {uploading && <p className="text-metadata text-text-secondary">Uploading…</p>}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPhoto(undefined)}
            aria-label="Remove the photo"
          >
            Remove photo
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onPhoto && !photo ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-caption font-semibold text-text-secondary hover:bg-surface-sunken focus-within:outline-2 focus-within:outline-focus">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={choose}
            />
            <Art name="camera" size="free" className="size-6" /> Add a photo
          </label>
        ) : (
          <span />
        )}
        <Button
          type="submit"
          size="sm"
          loading={busy}
          disabled={disabled || !trimmed || uploading}
          className="self-end"
        >
          <Art name={art} />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export interface PostCardProps {
  author: PostCardAuthor;
  body: string;
  createdAt: Date | string;
  /** Faux postal stamp, e.g. cohort label. Plain text only. */
  stamp?: string;
  /** Reactions per kind (counts only). */
  reactions: Record<ReactionKind, number>;
  /** The viewer's own reaction, if any. */
  myReaction: ReactionKind | null;
  /** Give or switch to a kind, or `null` to take the viewer's reaction back. */
  onReact: (kind: ReactionKind | null) => void;
  /** Whether this viewer may react. When not (e.g. their own card) only the summary is shown. Default true. */
  canReact?: boolean;
  /** Short honest status such as "Waiting for approval". Plain text only. */
  notice?: string;
  replies?: ReactNode;
  replyCount?: number;
  /** Rendered on the back of the card (typically <PostCardComposer kind="reply" />). */
  replyComposer?: ReactNode;
  /** Owner/author actions, e.g. Scrape Clean menu. */
  actions?: ReactNode;
  /** The card's photo (ADR-031), served only to people who may see the card. */
  photo?: { url: string; width: number; height: number } | null;
  /** What it is called to a screen reader ("Post Card from …"); a Town Hall post says "Post". */
  noun?: string;
}

/**
 * Post Card: the front shows the message + reactions; "Flip" turns it over to the scribbles (replies) and the reply composer.
 * Only the visible face is rendered, so the card is exactly as tall as its content and keyboard / screen-reader users
 * can only ever reach what they can see. The flip is an entrance animation on the newly shown face (removed under
 * prefers-reduced-motion), and focus moves to the control that replaces the one just used.
 */
export function PostCard({
  author,
  body,
  createdAt,
  stamp,
  reactions,
  myReaction,
  onReact,
  canReact = true,
  notice,
  replies,
  replyCount = 0,
  replyComposer,
  actions,
  photo,
  noun = 'Post Card',
}: PostCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [hasFlipped, setHasFlipped] = useState(false); // no animation / focus move on first paint
  const flipBtn = useRef<HTMLButtonElement>(null);
  const backBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!hasFlipped) return;
    (flipped ? backBtn : flipBtn).current?.focus();
  }, [flipped, hasFlipped]);

  function flip(to: boolean) {
    setHasFlipped(true);
    setFlipped(to);
  }

  const face = cn('clay flex flex-col gap-3 p-5', hasFlipped && 'animate-flip-in');

  return (
    <article aria-label={`${noun} from ${author.name}`} className="[perspective:1200px]">
      {flipped ? (
        <div className={cn(face, 'bg-parchment')}>
          <div className="flex items-center justify-between">
            <h3 className="text-title text-text-primary">Scribbles</h3>
            <Button ref={backBtn} variant="ghost" size="sm" onClick={() => flip(false)}>
              <FlipIcon /> Back to card
            </Button>
          </div>
          {replyCount > 0 ? (
            <ul className="flex flex-col gap-3">{replies}</ul>
          ) : (
            <p className="text-caption text-text-secondary">No scribbles yet. Be the first.</p>
          )}
          {replyComposer}
        </div>
      ) : (
        <div onDoubleClick={() => canReact && !myReaction && onReact('yo')} className={face}>
          <header className="flex items-start gap-3">
            <Avatar
              name={author.name}
              src={author.avatarUrl}
              {...(author.tint ? { tint: author.tint } : {})}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-semibold text-text-primary">
                {author.name}
                <NameBadge verified={author.verified} trusted={author.trusted} className="ml-1" />
              </p>
              <p className="text-metadata [overflow-wrap:anywhere] text-text-muted">
                @{author.handle} · <RelativeTime date={createdAt} />
              </p>
            </div>
            {stamp && (
              <span className="rounded-sm border-2 border-dashed border-border-strong px-2 py-0.5 font-mono text-metadata text-text-secondary">
                {stamp}
              </span>
            )}
            {actions}
          </header>
          <p className="text-body break-words whitespace-pre-wrap text-text-primary">{body}</p>
          {photo && (
            <Img
              src={photo.url}
              width={photo.width}
              height={photo.height}
              alt={`Photo on this ${noun === 'Post' ? 'post' : 'card'} from ${author.name}`}
              className="h-auto max-h-[28rem] w-full rounded-md bg-surface-sunken object-contain"
            />
          )}
          {notice && <p className="text-caption font-semibold text-text-secondary">{notice}</p>}
          <footer className="flex flex-wrap items-center justify-between gap-2">
            {canReact || myReaction ? (
              <ReactionBar reactions={reactions} mine={myReaction} onReact={onReact} />
            ) : (
              <ReactionSummary reactions={reactions} />
            )}
            <Button ref={flipBtn} variant="ghost" size="sm" className="ml-auto" onClick={() => flip(true)}>
              <FlipIcon /> Flip · {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </Button>
          </footer>
        </div>
      )}
    </article>
  );
}
