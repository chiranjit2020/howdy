'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AuthorRef, CardView, FencePage, ReplyView } from '@/modules/fence';
import type { ReactionKind } from '@/shared/validation/fence';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { Fence, PostCard, PostCardComposer, PostCardReply } from '@/ui/howdy';
import { Button, ConfirmationDialog, Dropdown, IconButton, useToast } from '@/ui/primitives';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { uploadPhoto } from '@/ui/media/upload-photo';

/** The parts of a page this component uses. Dates arrive as Date objects (first paint) or ISO strings (later pages). */
type WireReply = Omit<ReplyView, 'createdAt'> & { createdAt: Date | string };
type WireCard = Omit<CardView, 'createdAt' | 'replies'> & {
  createdAt: Date | string;
  replies: WireReply[];
  /** Home's feed only: whose wall the card is on. */
  wall?: AuthorRef;
};
export type InitialFence = Omit<FencePage, 'cards'> & { cards: WireCard[] };

type Removal = { kind: 'card' | 'reply'; id: string };

/**
 * One person's wall (their profile), or Home's feed of the walls of your friends. The feed's composer ("What's on your
 * mind?") posts to your own wall, `myHandle`.
 */
type Source = { handle: string; ownerName: string } | { feed: true; myHandle: string };

/**
 * The cards of a Fence on a Ranch, or of Home's feed. Everything here is a request for the server to decide: the buttons
 * that show are hints from the server (`canPost`, `canYo`, `canReply`, `canRemove`), and every action is re-checked
 * there. Cards a person may not see are never sent, so nothing is hidden by CSS.
 */
export function FenceSection({
  initial,
  signedIn,
  ...source
}: Source & { initial: InitialFence; signedIn: boolean }) {
  const feed = 'feed' in source;
  // The wall new posts go on: this one, or (in the feed) your own.
  const handle = feed ? source.myHandle : source.handle;
  const ownerName = feed ? '' : source.ownerName;
  const toast = useToast();
  const composerRef = useRef<HTMLDivElement>(null);
  // The tab bar's "Nail" button opens your Porch with ?nail=1: bring the composer into view and put the cursor in it.
  const wantsNail = useSearchParams().get('nail') === '1';
  useEffect(() => {
    if (!wantsNail) return;
    const box = composerRef.current;
    box?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    box?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [wantsNail]);
  const [cards, setCards] = useState<WireCard[]>(initial.cards);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removal, setRemoval] = useState<Removal | undefined>();
  const [removing, setRemoving] = useState(false);
  const [reporting, setReporting] = useState<string | undefined>();

  const patchCard = (id: string, fn: (c: WireCard) => WireCard) =>
    setCards((all) => all.map((c) => (c.id === id ? fn(c) : c)));

  async function nail(body: string, photoId?: string): Promise<boolean> {
    setError(undefined);
    const res = await postJson<{ card: WireCard }>(`/api/porch/${handle}/fence`, {
      body,
      ...(photoId ? { photoId } : {}),
    });
    if (res.ok && res.data) {
      const card = res.data.card;
      setCards((all) => [card, ...all]);
      return true;
    }
    setError(
      res.error?.fields?.body ??
        res.error?.fields?.photo ??
        res.error?.message ??
        'That did not work. Try again.',
    );
    return false;
  }

  async function reply(cardId: string, body: string): Promise<boolean> {
    setError(undefined);
    const res = await postJson<{ reply: WireReply }>(`/api/cards/${cardId}/replies`, { body });
    if (res.ok && res.data) {
      const made = res.data.reply;
      patchCard(cardId, (c) => ({ ...c, replies: [...c.replies, made] }));
      return true;
    }
    setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
    return false;
  }

  /** Give, switch or take back the viewer's reaction: shown at once, put back if the server says no. */
  async function react(card: WireCard, kind: ReactionKind | null) {
    const before = { myReaction: card.myReaction, reactions: card.reactions };
    const set = (mine: ReactionKind | null, reactions: Record<ReactionKind, number>) =>
      patchCard(card.id, (c) => ({
        ...c,
        myReaction: mine,
        yoByMe: mine !== null,
        reactions,
        yoCount: Object.values(reactions).reduce((a, b) => a + b, 0),
      }));
    const next = { ...card.reactions };
    if (card.myReaction) next[card.myReaction] = Math.max(0, next[card.myReaction] - 1);
    if (kind) next[kind] += 1;
    setError(undefined);
    set(kind, next);
    const res = await postJson(`/api/cards/${card.id}/yo`, kind ? { on: true, kind } : { on: false });
    if (!res.ok) {
      set(before.myReaction, before.reactions);
      setError(res.error?.message ?? 'That reaction did not go through.');
    }
  }

  async function confirmRemoval() {
    if (!removal) return;
    setRemoving(true);
    const res = await apiRequest(
      'DELETE',
      `/api/${removal.kind === 'card' ? 'cards' : 'replies'}/${removal.id}`,
    );
    setRemoving(false);
    if (res.ok || res.status === 404) {
      if (removal.kind === 'card') setCards((all) => all.filter((c) => c.id !== removal.id));
      else
        setCards((all) => all.map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== removal.id) })));
      toast({ title: removal.kind === 'card' ? 'Post taken down.' : 'Reply taken down.', tone: 'success' });
    } else setError(res.error?.message ?? 'Could not take that down.');
    setRemoval(undefined);
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await apiRequest<InitialFence>(
      'GET',
      feed ? `/api/feed?cursor=${next}` : `/api/porch/${handle}/fence?cursor=${next}`,
    );
    setLoadingMore(false);
    if (res.ok && res.data) {
      const more = res.data.cards;
      setCards((all) => [...all, ...more.filter((m) => !all.some((c) => c.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older posts.');
  }

  function cardMenu(c: WireCard) {
    const items = [
      ...(c.canRemove
        ? [
            {
              id: 'remove',
              // Your own words: take them back. Someone else's on your wall: clear them off it.
              label: c.mine ? 'Take it back' : 'Scrape clean',
              danger: true,
              onSelect: () => setRemoval({ kind: 'card', id: c.id }),
            },
          ]
        : []),
      ...(signedIn && !c.mine
        ? [{ id: 'report', label: 'Flag trouble…', onSelect: () => setReporting(c.id) }]
        : []),
    ];
    if (items.length === 0) return undefined;
    const label = `More about this post from @${c.author.handle}`;
    return (
      <Dropdown
        label={label}
        align="end"
        items={items}
        trigger={(p) => (
          <IconButton label={label} {...p}>
            ⋯
          </IconButton>
        )}
      />
    );
  }

  const composer = initial.canPost ? (
    <div
      ref={composerRef}
      id="nail"
      // In the feed it stands on the page on its own, so it gets a card of its own.
      className={cn('flex scroll-mt-24 flex-col gap-2', feed && 'clay p-4 sm:p-5')}
    >
      {initial.review && (
        <p className="text-caption text-text-secondary">
          Posts on this wall wait for {ownerName} to approve them before others see them.
        </p>
      )}
      <PostCardComposer
        kind={feed ? 'home' : 'card'}
        onSubmit={nail}
        {...(initial.canAddPhoto ? { onPhoto: (file: File) => uploadPhoto('/api/me/card-photo', file) } : {})}
      />
    </div>
  ) : undefined;

  return (
    <>
      {/* In the feed, "What's on your mind?" comes first and the "Friends' posts" heading sits over the posts it names;
        on a wall, the composer belongs under "The wall". */}
      {feed && composer}
      <Fence
        composer={feed ? undefined : composer}
        hasMore={next !== null}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        {...(feed ? { title: 'Friends’ posts' } : {})}
        emptyHint={
          feed
            ? 'Nothing from your friends yet. Write on a friend’s wall to get things going.'
            : initial.canPost
              ? 'The wall is quiet. Write the first post.'
              : 'The wall is quiet for now.'
        }
      >
        {cards.map((c) => (
          <PostCard
            key={c.id}
            author={{
              name: c.author.displayName,
              handle: c.author.handle,
              tint: c.author.portraitTint,
              avatarUrl: c.author.portraitUrl,
              verified: c.author.verified,
              trusted: c.author.trusted,
            }}
            body={c.body}
            createdAt={c.createdAt}
            reactions={c.reactions}
            myReaction={c.myReaction}
            canReact={c.canYo}
            onReact={(kind) => react(c, kind)}
            {...(c.waiting
              ? { notice: `Waiting for ${initial.isOwner ? 'you' : ownerName} to approve.` }
              : {})}
            replyCount={c.replies.length}
            replies={c.replies.map((r) => (
              <PostCardReply
                key={r.id}
                author={{
                  name: r.author.displayName,
                  handle: r.author.handle,
                  tint: r.author.portraitTint,
                  avatarUrl: r.author.portraitUrl,
                  verified: r.author.verified,
                  trusted: r.author.trusted,
                }}
                body={r.body}
                createdAt={r.createdAt}
                {...(r.waiting ? { notice: 'Waiting for approval.' } : {})}
                actions={
                  r.canRemove ? (
                    <Button
                      variant="link"
                      size="sm"
                      aria-label={`Remove reply by @${r.author.handle}`}
                      onClick={() => setRemoval({ kind: 'reply', id: r.id })}
                    >
                      Remove
                    </Button>
                  ) : undefined
                }
              />
            ))}
            {...(c.canReply
              ? { replyComposer: <PostCardComposer kind="reply" onSubmit={(b) => reply(c.id, b)} /> }
              : {})}
            actions={cardMenu(c)}
            photo={c.photo}
            // In the feed, say whose wall it is on, unless they wrote it on their own.
            {...(c.wall && c.wall.handle !== c.author.handle
              ? { wall: { name: c.wall.displayName, handle: c.wall.handle } }
              : {})}
          />
        ))}
      </Fence>
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <ConfirmationDialog
        open={removal !== undefined}
        destructive
        title={removal?.kind === 'reply' ? 'Take this reply down?' : 'Take this post down?'}
        description="It is removed for everyone, together with its replies and reactions. This cannot be undone."
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setRemoval(undefined)}
        onConfirm={confirmRemoval}
      />
      <ReportDialog
        open={reporting !== undefined}
        title="Flag this post"
        endpoint={`/api/cards/${reporting ?? ''}/report`}
        onClose={() => setReporting(undefined)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </>
  );
}
