'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { StoryItem, StoryRingItem } from '@/modules/stories';
import { REACTION_KINDS, type ReactionKind } from '@/shared/validation/fence';
import { apiRequest, postJson } from '@/ui/auth/api';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { REACTION_LABEL, ReactionArt } from '@/ui/howdy';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { RelativeTime } from '@/ui/howdy/time';
import { CloseIcon, EyeIcon, MoreIcon, PauseIcon, PlayIcon, PlusIcon, ReactIcon, StarIcon } from '@/ui/icons';
import { Avatar, ConfirmationDialog, Dropdown, useToast } from '@/ui/primitives';

/** A round control on the dark Story backdrop (44 px: thumb-sized). */
const ROUND =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-title text-on-island transition hover:bg-on-island/15';
/** Longer than this, a press on the photo is "hold to pause", not a tap to move on. */
const HOLD_MS = 300;

/**
 * One person's Stories, full screen (ADR-047), the way people know Stories: bars along the top fill as each one plays,
 * tap the right of the photo for the next and the left for the one before, hold to pause. Below the photo: a reply and
 * a reaction for a Pal's Story; who has seen it and "Add" for mine. Everything else sits in the ⋯ menu.
 */
export function StoryViewer({
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
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<StoryItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // With reduced motion the bars do not run, so nothing moves on by itself: the person taps.
  const [still, setStill] = useState(false);
  const viewed = useRef(new Set<string>());
  const closed = useRef(false);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.showModal();
    document.documentElement.classList.add('overflow-hidden');
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return () => {
      if (el.open) el.close();
      document.documentElement.classList.remove('overflow-hidden');
    };
  }, []);

  useEffect(() => {
    let live = true;
    void apiRequest<{ stories: StoryItem[] }>('GET', `/api/porch/${ring.person.handle}/stories`).then(
      (res) => {
        if (!live) return;
        if (res.ok && res.data) setItems(res.data.stories);
        else setError('This Story is no longer here.');
      },
    );
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

  const go = useCallback(
    (step: 1 | -1) => {
      if (!items) return;
      setTray(false);
      if (step === 1 && index + 1 >= items.length) return close();
      setIndex(Math.max(0, index + step));
    },
    [index, items, close],
  );

  const stopped = paused || holding || tray || sheet || reporting || deleting;

  async function react(kind: ReactionKind) {
    if (!story) return;
    const to = story.myReaction === kind ? null : kind;
    const res = await postJson<{ myReaction: ReactionKind | null }>(`/api/stories/${story.id}/react`, {
      kind: to,
    });
    setTray(false);
    if (res.ok && res.data) {
      const mine = res.data.myReaction;
      setItems((all) => all && all.map((s) => (s.id === story.id ? { ...s, myReaction: mine } : s)));
    } else toast({ title: res.error?.message ?? 'That did not work.', tone: 'danger' });
  }

  async function remove() {
    if (!story || !items) return;
    const res = await apiRequest('DELETE', `/api/stories/${story.id}`);
    setDeleting(false);
    if (!res.ok) return toast({ title: res.error?.message ?? 'That did not work.', tone: 'danger' });
    toast({ title: 'Story taken down.', tone: 'success' });
    const left = items.filter((s) => s.id !== story.id);
    if (left.length === 0) return close();
    setItems(left);
    setIndex(Math.min(index, left.length - 1));
  }

  const firstName = ring.person.displayName.split(' ')[0] ?? ring.person.displayName;
  const replyHref = story
    ? `/whispers/${ring.person.handle}?draft=${encodeURIComponent(
        `Replying to your Story${story.caption ? ` (“${story.caption}”)` : ''}: `,
      )}`
    : '#';
  const seen = story?.viewers;
  const reactedOnly = story?.reactions ?? [];

  const menu = story?.mine
    ? [
        { id: 'add', label: 'Add to your Story', onSelect: onAdd },
        { id: 'down', label: 'Take this Story down', danger: true, onSelect: () => setDeleting(true) },
      ]
    : [{ id: 'flag', label: 'Flag this Story', danger: true, onSelect: () => setReporting(true) }];

  return (
    <dialog
      ref={ref}
      aria-labelledby="story-title"
      onClose={close}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('[role=menu],form')) return;
        if (e.key === 'ArrowRight') go(1);
        else if (e.key === 'ArrowLeft') go(-1);
      }}
      className={cn(
        'm-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-island p-0 text-on-island backdrop:bg-island/90',
        'sm:m-auto sm:h-[min(92dvh,52rem)] sm:w-[min(92vw,28rem)] sm:rounded-xl sm:shadow-float',
      )}
    >
      <div className="relative flex h-full flex-col">
        {story && (
          <Img
            key={story.id}
            src={story.photo.url}
            width={story.photo.width}
            height={story.photo.height}
            alt={
              story.caption
                ? `Story photo: ${story.caption}`
                : `A Story photo from ${ring.person.displayName}`
            }
            loading="eager"
            className="pointer-events-none absolute inset-0 size-full object-contain select-none"
          />
        )}

        {/* Top: one bar per Story, then whose it is and the controls. */}
        <header className="relative z-20 flex flex-col gap-2 bg-linear-to-b from-island/80 to-transparent px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-6">
          <div className="flex gap-1 px-1" aria-hidden="true">
            {(items ?? [undefined]).map((s, i) => (
              <span
                key={s?.id ?? 'loading'}
                className="h-0.5 flex-1 overflow-hidden rounded-pill bg-on-island/30"
              >
                {s && (
                  <span
                    className={cn(
                      'block h-full origin-left bg-on-island',
                      i > index && 'scale-x-0',
                      i === index && !still && 'animate-story-fill',
                      i === index && stopped && '[animation-play-state:paused]',
                    )}
                    onAnimationEnd={i === index ? () => go(1) : undefined}
                  />
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
              <Avatar
                name={ring.person.displayName}
                tint={ring.person.portraitTint}
                src={ring.person.portraitUrl}
                size="sm"
              />
              <div className="flex min-w-0 flex-col leading-tight">
                <h2 id="story-title" className="truncate text-body font-semibold">
                  {ring.mine ? (
                    'Your Story'
                  ) : (
                    <>
                      {ring.person.displayName}
                      <span className="sr-only">’s Story</span>
                    </>
                  )}
                </h2>
                {story && (
                  <span className="flex items-center gap-1 text-caption text-on-island-muted">
                    <RelativeTime date={story.postedAt} />
                    {story.audience === 'close' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <StarIcon className="text-metadata" />
                        Close Pals
                      </>
                    )}
                    {items && items.length > 1 && (
                      <span className="sr-only">
                        , Story {index + 1} of {items.length}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
            {story && !still && (
              <button
                type="button"
                className={ROUND}
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Play' : 'Pause'}
              >
                {paused ? <PlayIcon /> : <PauseIcon />}
              </button>
            )}
            {story && (
              <Dropdown
                label="Story options"
                align="end"
                items={menu}
                trigger={(props) => (
                  <button
                    type="button"
                    {...props}
                    onClick={() => {
                      setPaused(true);
                      props.onClick();
                    }}
                    aria-label="More"
                    className={ROUND}
                  >
                    <MoreIcon />
                  </button>
                )}
              />
            )}
            <button type="button" className={ROUND} onClick={close} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </header>

        {/* The photo itself is the control: left third back, the rest forward; hold to pause. */}
        <div className="relative z-10 flex flex-1 select-none [-webkit-touch-callout:none]">
          {error && <p className="m-auto px-6 text-center text-body">{error}</p>}
          {!items && !error && <p className="m-auto text-caption text-on-island-muted">Opening…</p>}
          {story && (
            <>
              <TapZone label="Previous Story" className="w-1/3" onTap={() => go(-1)} onHold={setHolding} />
              <TapZone
                label={items && index + 1 < items.length ? 'Next Story' : 'Close Stories'}
                className="flex-1"
                onTap={() => go(1)}
                onHold={setHolding}
              />
            </>
          )}
        </div>

        {story && (
          <footer className="relative z-10 flex flex-col gap-3 bg-linear-to-t from-island/85 to-transparent px-3 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {story.caption && (
              <p className="text-center text-body font-medium [overflow-wrap:anywhere]">{story.caption}</p>
            )}

            {!story.mine && (
              <>
                {tray && (
                  <div
                    role="group"
                    aria-label="React to this Story"
                    className="flex items-center justify-between self-stretch rounded-pill bg-island-raised px-1 shadow-float"
                  >
                    {REACTION_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => react(k)}
                        aria-pressed={story.myReaction === k}
                        aria-label={REACTION_LABEL[k]}
                        className={cn(
                          'inline-flex size-11 items-center justify-center rounded-pill transition',
                          story.myReaction === k ? 'bg-on-island/20' : 'hover:bg-on-island/10',
                        )}
                      >
                        <ReactionArt kind={k} className="size-7" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <a
                    href={replyHref}
                    className="flex min-h-11 min-w-0 flex-1 items-center rounded-pill border border-on-island/40 px-4 text-body text-on-island-muted hover:border-on-island/70"
                  >
                    <span className="truncate">Reply to {firstName}…</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setTray((t) => !t)}
                    aria-expanded={tray}
                    aria-label={
                      story.myReaction ? `You reacted ${REACTION_LABEL[story.myReaction]}. Change` : 'React'
                    }
                    className={cn(ROUND, story.myReaction && 'bg-on-island/15')}
                  >
                    {story.myReaction ? (
                      <ReactionArt kind={story.myReaction} className="size-7" />
                    ) : (
                      <ReactIcon />
                    )}
                  </button>
                </div>
              </>
            )}

            {story.mine && (
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 text-body font-semibold hover:bg-on-island/15"
                >
                  <EyeIcon className="text-title" />
                  {seen ? `Seen by ${seen.length}` : 'Reactions'}
                  {reactedOnly.length > 0 && (
                    <span className="text-on-island-muted">
                      {seen ? `· ${reactedOnly.length} more reacted` : `· ${reactedOnly.length}`}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onAdd}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-on-island/15 px-4 text-body font-semibold hover:bg-on-island/25"
                >
                  <PlusIcon />
                  Add
                </button>
              </div>
            )}
          </footer>
        )}

        {sheet && story?.mine && (
          <ViewersSheet onClose={() => setSheet(false)} title={seen ? `Seen by ${seen.length}` : 'Reactions'}>
            {[...(seen ?? []), ...reactedOnly].map((v) => (
              <li key={v.person.handle} className="flex items-center gap-3 py-1.5">
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
            {seen && seen.length === 0 && reactedOnly.length === 0 && (
              <li className="py-2 text-caption text-text-secondary">
                Nobody yet — or only people who keep their Story views to themselves.
              </li>
            )}
            {!seen && (
              <li className="py-2 text-caption text-text-secondary">
                Your Story views are off, so you do not see who viewed. Turn them on in the Workshop.
              </li>
            )}
          </ViewersSheet>
        )}
      </div>

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
    </dialog>
  );
}

/** Part of the photo as a button: a tap moves; a long press only pauses. A keyboard "click" has no press, so it moves. */
function TapZone({
  label,
  className,
  onTap,
  onHold,
}: {
  label: string;
  className: string;
  onTap: () => void;
  onHold: (holding: boolean) => void;
}) {
  const pressedAt = useRef<number | null>(null);
  const release = () => onHold(false);
  return (
    <button
      type="button"
      aria-label={label}
      className={className}
      onPointerDown={() => {
        pressedAt.current = Date.now();
        onHold(true);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        const long = pressedAt.current !== null && Date.now() - pressedAt.current > HOLD_MS;
        pressedAt.current = null;
        if (!long) onTap();
      }}
    />
  );
}

/** Who saw my Story: a light sheet over the bottom of the photo. */
function ViewersSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-20 cursor-default bg-island/40"
      />
      <section
        aria-labelledby="story-viewers"
        className="absolute inset-x-0 bottom-0 z-30 flex max-h-[65%] flex-col rounded-t-xl bg-surface text-text-primary shadow-float"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <h3 id="story-viewers" ref={heading} tabIndex={-1} className="text-title">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list"
            className="inline-flex size-11 items-center justify-center rounded-pill text-title hover:bg-surface-sunken"
          >
            <CloseIcon />
          </button>
        </div>
        <ul className="flex flex-col overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </ul>
      </section>
    </>
  );
}
