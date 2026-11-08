'use client';

import Link from 'next/link';
import { FoldedText } from './folded-text';
import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { LIMITS } from '@/shared/limits';
import { LEADING_MENTION } from '@/shared/mentions';
import type { ReactionKind } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { Img } from '../art/img';
import { cn } from '../cn';
import { CameraIcon, CommentIcon, PinIcon, ReplyIcon, SendIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { PhotoViewer } from '../primitives/dialog';
import { Button, buttonClasses } from '../primitives/button';
import { IconButton } from '../primitives/icon-button';
import { Input, Textarea } from '../primitives/field';
import { FormMessage } from '../auth/form-parts';
import type { PhotoUpload } from '../media/upload-photo';
import { RelativeTime } from './time';
import { NameBadge } from './verified-badge';
import { STAR_KIND, StarButton } from './reactions';

/** A person's name as a link to their profile: reads as a name, underlines on hover. */
const NAME_LINK = 'font-semibold text-text-primary no-underline hover:underline';

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

/**
 * Between a Post Card and what is inside it: the Reply link under each reply asks the card to start a reply addressed to
 * that person ("@ravi "), and the card's reply box picks the words up. Absent where nobody may reply.
 */
const ReplyTo = createContext<{ replyTo: (handle: string) => void; draft: string } | null>(null);

function ReplyBody({ body }: { body: string }) {
  const m = LEADING_MENTION.exec(body);
  if (!m) return <>{body}</>;
  return (
    <>
      <Link
        href={`/profile/${m[1]!.toLowerCase()}`}
        className="font-semibold text-accent no-underline hover:underline"
      >
        {m[0]}
      </Link>
      {body.slice(m[0].length)}
    </>
  );
}

/** One reply under a Post Card (max 80 chars, enforced server-side): a speech bubble with its writer's name in it. */
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
  const reply = useContext(ReplyTo);
  return (
    <li className="flex gap-2.5">
      <Avatar
        name={author.name}
        src={author.avatarUrl}
        {...(author.tint ? { tint: author.tint } : {})}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        {/* Grey, not Sunflower (2026-11-08): yellow is for things to tap (the Star, Home, buttons); a thread of yellow
            bubbles competed with the Star. Grey reads as conversation. */}
        <div className="w-fit max-w-full rounded-lg bg-surface-sunken px-2.5 py-1.5">
          <p className="text-caption [overflow-wrap:anywhere]">
            <Link href={`/profile/${author.handle}`} className={NAME_LINK}>
              {author.name}
            </Link>
            <NameBadge verified={author.verified} trusted={author.trusted} className="ml-0.5" />{' '}
            <span className="text-metadata text-text-muted">@{author.handle}</span>
          </p>
          <p className="text-caption break-words text-text-primary">
            <ReplyBody body={body} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 pl-2.5 text-metadata text-text-muted">
          <RelativeTime date={createdAt} />
          {notice && <span>· {notice}</span>}
          {reply && (
            <Button
              variant="link"
              size="sm"
              aria-label={`Reply to ${author.name}`}
              onClick={() => reply.replyTo(author.handle)}
            >
              Reply
            </Button>
          )}
          {actions}
        </div>
      </div>
    </li>
  );
}

/** What a composer writes: a Post Card, a reply on one, or a post in a Town Hall's feed (ADR-033). */
const COMPOSER = {
  card: {
    max: LIMITS.POST_CARD_MAX,
    label: 'Write a post',
    // The label is for screen readers only (one-line box), so the placeholder says what the box is for.
    placeholder: 'Write a post…',
    rows: 3,
    submit: 'Post',
  },
  reply: {
    max: LIMITS.REPLY_MAX,
    label: 'Write a reply',
    placeholder: 'Write a reply…',
    rows: 2,
    // Not "Reply": the card's own Reply button (which opens this box) is right above it.
    submit: 'Send',
  },
  /** Home: a card on your own wall, which your friends see in their feed. */
  home: {
    max: LIMITS.POST_CARD_MAX,
    label: 'What’s on your mind?',
    placeholder: 'What’s on your mind?',
    rows: 2,
    submit: 'Post',
  },
  post: {
    max: LIMITS.TOWNHALL_POST_MAX,
    label: 'Post to this group',
    placeholder: 'Say howdy, ask something, share news…',
    rows: 3,
    submit: 'Post',
  },
} as const;

/**
 * Composer for a Post Card (500), a reply (280) or a Town Hall post (280). Limits come from LIMITS; the server is the authority. A card composer
 * given `onPhoto` also offers one photo (ADR-031): it uploads as soon as it is chosen, shows a local preview, and its id
 * goes with the words when the card is nailed.
 */
export function PostCardComposer({
  kind,
  onSubmit,
  onPhoto,
  disabled,
  lead,
}: {
  kind: keyof typeof COMPOSER;
  /** Return `false` to keep what was typed (e.g. the server refused it); anything else clears the box. */
  onSubmit: (body: string, photoId?: string) => boolean | void | Promise<boolean | void>;
  /** Upload a chosen photo; only offered when given (the server decides who may add one). */
  onPhoto?: (file: File) => Promise<PhotoUpload>;
  disabled?: boolean;
  /** Something before the box, outside the form (Home: your Story button when no friend has a Story). */
  lead?: ReactNode;
}) {
  const { max, label, placeholder, rows, submit: submitLabel } = COMPOSER[kind];
  // A reply box opened by "Reply" under someone's reply starts with "@them " (it is remounted for each one).
  const preset = useContext(ReplyTo)?.draft ?? '';
  const [body, setBody] = useState(kind === 'reply' ? preset : '');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ preview: string; id?: string } | undefined>();
  const [photoError, setPhotoError] = useState<string | undefined>();
  const uploading = photo !== undefined && photo.id === undefined;
  const trimmed = body.trim();
  // Every post box (Home, a wall, a group) is one borderless line until you click in; it stays open while it holds
  // words, a photo or a photo error, and closes again when you leave it empty. "Add a photo" lives in the open box only
  // (2026-11-07: a camera beside the closed line did the same job twice). Focus moving on to the form's own buttons
  // keeps it open.
  // (A reply box is its own one-line design, above.)
  const [focused, setFocused] = useState(false);
  // The file picker is open. The whole window loses focus while it shows, which would close an empty box and unmount
  // the file input mid-choice (the photo would be lost), so the box stays open until the window has focus again.
  const [picking, setPicking] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const collapsible = kind !== 'reply';
  const open =
    !collapsible || focused || picking || body !== '' || photo !== undefined || photoError !== undefined;

  function startPicking(e: MouseEvent<HTMLLabelElement>) {
    setPicking(true);
    // Back from the picker: a photo chosen (choose() clears it, and the photo keeps the box open by itself), the picker
    // cancelled (the input's `cancel` event), or, where a browser sends neither, the window getting its focus back.
    const done = () => setPicking(false);
    e.currentTarget.querySelector('input')?.addEventListener('cancel', done, { once: true });
    window.addEventListener('focus', () => setTimeout(done, 500), { once: true });
  }

  // Free the temporary preview address when it is replaced or the composer goes away.
  const previewUrl = photo?.preview;
  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl]);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still triggers a change
    setPicking(false);
    if (!file || !onPhoto) return;
    setPhotoError(undefined);
    const preview = URL.createObjectURL(file);
    setPhoto({ preview });
    if (collapsible) box.current?.focus(); // straight on to the words, for a caption
    const res = await onPhoto(file);
    if (res.ok) setPhoto((p) => (p?.preview === preview ? { preview, id: res.mediaId } : p));
    else {
      setPhoto(undefined);
      setPhotoError(res.message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Words OR a photo: most people post the photo alone (2026-11-07). A reply has no photo, so it needs words.
    if ((!trimmed && !photo?.id) || busy || uploading) return;
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

  // A reply is one line (280 characters at most): the box and a round Sunflower Send (paper plane) side by side, Enter sends. How much
  // is left shows only near the end.
  if (kind === 'reply') {
    const left = max - body.length;
    return (
      <form onSubmit={submit} className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Input
            label={label}
            hideLabel
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={max}
            placeholder={placeholder}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <IconButton
            type="submit"
            tone="accent"
            label={submitLabel}
            disabled={disabled || busy || !trimmed}
            aria-busy={busy || undefined}
          >
            <SendIcon className="size-4" />
          </IconButton>
        </div>
        {left <= 15 && (
          <p
            aria-live="polite"
            className={cn('text-metadata', left <= 5 ? 'text-danger' : 'text-text-muted')}
          >
            {left} {left === 1 ? 'character' : 'characters'} left
          </p>
        )}
      </form>
    );
  }

  // A file input can only be opened by its label, so the label wears a button's look.
  // Pressing it must not take focus from the box: an empty box closes when it loses focus, which would remove this very
  // button mid-click and the file picker would never open ("Add a photo" only worked after typing something).
  // Keyboard users are unaffected: tabbing reaches the file input inside the form, which keeps it open.
  const photoPicker = (look: string, children: ReactNode) => (
    <label
      onMouseDown={(e) => e.preventDefault()}
      onClick={startPicking}
      className={cn(look, 'cursor-pointer focus-within:outline-2 focus-within:outline-focus')}
    >
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={choose} />
      {children}
    </label>
  );

  const form = (
    // The box stays the first child in both states, so opening it never remounts it (focus and caret stay put).
    <form
      onSubmit={submit}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      className={cn('flex gap-2', open ? 'flex-col' : 'items-center', lead !== undefined && 'min-w-0 flex-1')}
    >
      <Textarea
        ref={box}
        onFocus={() => setFocused(true)}
        label={label}
        hideLabel={collapsible}
        oneLine={collapsible}
        bare={collapsible}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={max}
        showCount={open}
        rows={open ? rows : 1}
        placeholder={placeholder}
        className={open ? undefined : 'min-w-0 flex-1'}
      />
      {photoError && <FormMessage tone="error">{photoError}</FormMessage>}
      {photo && (
        <div className="relative self-start">
          {/* A local preview (blob:) of the chosen file, before or while it uploads. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: preview; see ui/art/img.tsx */}
          <img
            src={photo.preview}
            alt={`The photo you chose for this ${kind === 'post' ? 'post' : 'card'}`}
            className={cn('max-h-40 rounded-card-inset object-contain', uploading && 'opacity-60')}
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
      {open && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {onPhoto && !photo ? (
            photoPicker(
              buttonClasses({ variant: 'secondary', size: 'sm' }),
              <>
                <CameraIcon className="size-4" /> Add a photo
              </>,
            )
          ) : (
            <span />
          )}
          <Button
            type="submit"
            size="sm"
            loading={busy}
            disabled={disabled || (!trimmed && !photo) || uploading}
            className="self-end"
          >
            <SendIcon className="size-4" />
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
  // The lead sits beside the form, not in it: what it opens (the Story composer) has a form of its own.
  return lead === undefined ? (
    form
  ) : (
    <div className={cn('flex gap-3', open ? 'items-start' : 'items-center')}>
      {lead}
      {form}
    </div>
  );
}

export interface PostCardProps {
  author: PostCardAuthor;
  body: string;
  createdAt: Date | string;
  /** Faux postal stamp, e.g. cohort label. Plain text only. */
  stamp?: string;
  /** A group's pinned notice (ADR-055): a sunflower "Pinned" badge in the header, instead of a stamp. */
  pinned?: boolean;
  /** Something the post carries above its words: a group event's details and answers (ADR-056). */
  attachment?: ReactNode;
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
  /** Whose wall it is on, when that is not plain from the page (Home's feed): "on Priya's wall", linked. */
  wall?: { name: string; handle: string };
  /** Start with every reply shown and the reply box open (a post on its own page, opened from a notification). */
  startOpen?: boolean;
}

/** The list posts go in: each post its own card, 10 px apart (the user's call: merged posts hid who wrote what). */
export const POST_LIST = 'flex flex-col gap-2.5';

/** The tallest a photo stands in the feed: 4:5, as on Instagram and Facebook. Taller ones are cropped to it. */
const TALLEST = 5 / 4;

/**
 * A post's photo, the way big feeds show them: always the post's full width; landscape and square whole; anything taller
 * than 4:5 cropped from the centre to 4:5 so one photo never fills the screen. A tap shows the whole photo.
 */
function PostPhoto({ photo, alt }: { photo: { url: string; width: number; height: number }; alt: string }) {
  const [open, setOpen] = useState(false);
  const tall = photo.height / photo.width > TALLEST;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt}. Show the whole photo`}
        // A double-click here opens the photo, nothing else (on the rest of the post it gives a Star).
        onDoubleClick={(e) => e.stopPropagation()}
        className="block w-full cursor-zoom-in overflow-hidden rounded-card-inset-sm sm:rounded-card-inset"
      >
        <Img
          src={photo.url}
          width={photo.width}
          height={photo.height}
          alt=""
          className={cn('block w-full', tall ? 'aspect-[4/5] object-cover' : 'h-auto')}
        />
      </button>
      <PhotoViewer
        open={open}
        onClose={() => setOpen(false)}
        src={photo.url}
        width={photo.width}
        height={photo.height}
        alt={alt}
      />
    </>
  );
}

/** How many of the newest replies show under a card before "View all". */
const REPLY_PREVIEW = 2;

/** Each reply on its own, whether they came as a list or wrapped in a fragment (`<>…</>`). */
function flatReplies(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((n) =>
    isValidElement<{ children?: ReactNode }>(n) && n.type === Fragment ? flatReplies(n.props.children) : [n],
  );
}

/**
 * Post Card: who wrote it, the words and photo, then one row of reactions (yours and the counts) and Reply. The newest replies show under the
 * card; "View all" or Reply opens the rest together with the reply box (Reply also puts the cursor in it). Nothing hides
 * the post while you read its replies.
 */
export function PostCard({
  author,
  body,
  createdAt,
  stamp,
  pinned,
  attachment,
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
  noun = 'Post',
  wall,
  startOpen = false,
}: PostCardProps) {
  const [open, setOpen] = useState(startOpen);
  const wantsFocus = useRef(false);
  const repliesRef = useRef<HTMLDivElement>(null);
  const repliesId = useId();
  // What the reply box starts with, and a counter that gives it a fresh box each time (so the words are re-read).
  const [draft, setDraft] = useState({ text: '', n: 0 });
  const focusReplyBox = () => {
    const box = repliesRef.current?.querySelector<HTMLInputElement>('input, textarea');
    if (!box) return;
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length); // after "@ravi ", ready to type
  };

  // The reply box exists (or is fresh) only after the render that opens it, so focus it then.
  useEffect(() => {
    if (!open || !wantsFocus.current) return;
    wantsFocus.current = false;
    focusReplyBox();
  }, [open, draft.n]);

  function startReply() {
    if (open) focusReplyBox();
    else {
      wantsFocus.current = true;
      setOpen(true);
    }
  }

  /** "Reply" under someone's reply: open the box addressed to them. */
  function replyTo(handle: string) {
    wantsFocus.current = true;
    setDraft((d) => ({ text: `@${handle} `, n: d.n + 1 }));
    setOpen(true);
  }

  const all = flatReplies(replies);
  const shown = open ? all : all.slice(-REPLY_PREVIEW);
  const hidden = all.length - shown.length;
  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const repliesLabel = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  const hasActions = canReact || !!myReaction || !!replyComposer || totalReactions > 0 || replyCount > 0;

  return (
    // The Reply links under replies exist only where this viewer may reply.
    <ReplyTo.Provider value={replyComposer ? { replyTo, draft: draft.text } : null}>
      <article aria-label={`${noun} from ${author.name}`} className="clay flex flex-col">
        <div
          onDoubleClick={() => canReact && !myReaction && onReact(STAR_KIND)}
          // With a reaction row under it, the post keeps only 4 px below so the row reads as part of the post.
          // 12px padding on phones (2026-11-08), 16px from sm up: on a 390px phone the text and photo gain 24px.
          className={cn('flex flex-col gap-3 p-3 sm:p-4', hasActions && 'pb-1 sm:pb-1')}
        >
          <header className="flex items-start gap-3">
            <Avatar
              name={author.name}
              src={author.avatarUrl}
              {...(author.tint ? { tint: author.tint } : {})}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body">
                <Link href={`/profile/${author.handle}`} className={NAME_LINK}>
                  {author.name}
                </Link>
                <NameBadge verified={author.verified} trusted={author.trusted} className="ml-1" />
              </p>
              {/* The username stays in sight: names are not unique, the username is (and a name may not hold "@"). */}
              {/* Quiet like the mock cards: 12 px, regular weight, grey, so the name leads and this reads as a footnote. */}
              <p className="text-metadata font-normal [overflow-wrap:anywhere] text-text-muted">
                @{author.handle} · <RelativeTime date={createdAt} />
                {wall && (
                  <>
                    {' · on '}
                    <Link href={`/profile/${wall.handle}`} className="font-medium text-text-secondary">
                      {wall.name}
                    </Link>
                    ’s wall
                  </>
                )}
              </p>
            </div>
            {pinned && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-highlight px-2 py-0.5 text-metadata font-semibold text-on-highlight">
                <PinIcon aria-hidden="true" className="size-3" />
                Pinned
              </span>
            )}
            {stamp && !pinned && (
              <span className="rounded-sm border-2 border-dashed border-border-strong px-2 py-0.5 text-metadata text-text-secondary">
                {stamp}
              </span>
            )}
            {actions}
          </header>
          {attachment}
          {body && <FoldedText className="text-body text-text-primary">{body}</FoldedText>}
          {photo && (
            <PostPhoto
              photo={photo}
              alt={`Photo on this ${noun === 'Post' ? 'post' : 'card'} from ${author.name}`}
            />
          )}
          {notice && <p className="text-caption font-semibold text-text-secondary">{notice}</p>}
        </div>

        {/* One row: the Star and how many replies on the left, Reply on the right. */}
        {hasActions && (
          // No dividing line (2026-11-07): a rule between the post and its reactions read as "end of post", and people
          // stopped before reacting. The row sits right under the post instead, as part of it.
          // 12 px below (plus the buttons' own inner space) so the card's bottom edge breathes like its 16 px top.
          <footer className="mx-3 flex items-center gap-1 pb-3 sm:mx-4">
            <StarButton
              reactions={reactions}
              mine={myReaction}
              {...(canReact || myReaction ? { onReact } : {})}
            />
            {replyCount > 0 && (
              // How many replies, beside the Star (2026-11-07): a lively thread draws people in. A tap shows them all.
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`${repliesLabel}, show them`}
                aria-controls={repliesId}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-caption font-semibold text-text-primary tabular-nums transition-colors duration-150 hover:bg-surface-sunken pointer-fine:min-h-8"
              >
                <CommentIcon aria-hidden="true" className="text-[1.25rem]" />
                {replyCount}
              </button>
            )}
            {replyComposer && (
              <Button
                variant="ghost"
                size="sm"
                // -mr-3: the word ends on the card's padding edge, level with the photo; the hover pill keeps its padding.
                className="-mr-3 ml-auto"
                aria-expanded={open}
                aria-controls={repliesId}
                onClick={startReply}
              >
                <ReplyIcon className="size-5" /> Reply
              </Button>
            )}
          </footer>
        )}

        {(shown.length > 0 || (open && replyComposer)) && (
          <div ref={repliesRef} id={repliesId} className="flex flex-col gap-2 px-3 pt-1 pb-3 sm:px-4">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="self-start text-caption font-semibold text-text-secondary hover:text-text-primary hover:underline"
              >
                View all {repliesLabel}
              </button>
            )}
            {shown.length > 0 && (
              <ul aria-label={`Replies to this ${noun.toLowerCase()}`} className="flex flex-col gap-2">
                {shown}
              </ul>
            )}
            {open && <Fragment key={draft.n}>{replyComposer}</Fragment>}
          </div>
        )}
      </article>
    </ReplyTo.Provider>
  );
}
