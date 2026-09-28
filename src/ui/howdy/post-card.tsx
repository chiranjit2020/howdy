'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LIMITS } from '@/shared/limits';
import type { ReactionKind } from '@/shared/validation/fence';
import type { PortraitTint } from '@/shared/validation/profile';
import { cn } from '../cn';
import { FlipIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { Button } from '../primitives/button';
import { Textarea } from '../primitives/field';
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
        <p className="font-mono text-code break-words text-text-primary">{body}</p>
        {notice && <p className="text-metadata text-text-muted">{notice}</p>}
        {actions}
      </div>
    </li>
  );
}

/** Composer for a Post Card (160) or a reply (80). Limits come from LIMITS; the server is the authority. */
export function PostCardComposer({
  kind,
  onSubmit,
  disabled,
}: {
  kind: 'card' | 'reply';
  /** Return `false` to keep what was typed (e.g. the server refused it); anything else clears the box. */
  onSubmit: (body: string) => boolean | void | Promise<boolean | void>;
  disabled?: boolean;
}) {
  const max = kind === 'card' ? LIMITS.POST_CARD_MAX : LIMITS.REPLY_MAX;
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = body.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok !== false) setBody('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        label={kind === 'card' ? 'Nail a Post Card' : 'Scribble a reply'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={max}
        showCount
        rows={kind === 'card' ? 3 : 2}
        placeholder={kind === 'card' ? 'Short and sweet…' : 'One or two lines. Longer? Take it to a Whisper.'}
      />
      <Button type="submit" size="sm" loading={busy} disabled={disabled || !trimmed} className="self-end">
        {kind === 'card' ? 'Nail to Fence' : 'Scribble'}
      </Button>
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
    <article aria-label={`Post Card from ${author.name}`} className="[perspective:1200px]">
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
