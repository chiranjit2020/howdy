'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { CardView, FencePage, ReplyView } from '@/modules/fence';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { Fence, PostCard, PostCardComposer, PostCardReply } from '@/ui/howdy';
import { Button, ConfirmationDialog, Dropdown, IconButton, useToast } from '@/ui/primitives';
import { ReportDialog } from './report-dialog';

/** The parts of a page this component uses. Dates arrive as Date objects (first paint) or ISO strings (later pages). */
type WireReply = Omit<ReplyView, 'createdAt'> & { createdAt: Date | string };
type WireCard = Omit<CardView, 'createdAt' | 'replies'> & {
  createdAt: Date | string;
  replies: WireReply[];
};
export type InitialFence = Omit<FencePage, 'cards'> & { cards: WireCard[] };

type Removal = { kind: 'card' | 'reply'; id: string };

/**
 * The Fence on a Ranch. Everything here is a request for the server to decide: the buttons that show are hints from the
 * server (`canPost`, `canYo`, `canReply`, `canRemove`), and every action is re-checked there. Cards a person may not see
 * are never sent, so nothing is hidden by CSS.
 */
export function FenceSection({
  handle,
  ownerName,
  initial,
  signedIn,
}: {
  handle: string;
  ownerName: string;
  initial: InitialFence;
  signedIn: boolean;
}) {
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

  async function nail(body: string): Promise<boolean> {
    setError(undefined);
    const res = await postJson<{ card: WireCard }>(`/api/ranch/${handle}/fence`, { body });
    if (res.ok && res.data) {
      const card = res.data.card;
      setCards((all) => [card, ...all]);
      return true;
    }
    setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
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

  async function toggleYo(card: WireCard) {
    const on = !card.yoByMe;
    setError(undefined);
    patchCard(card.id, (c) => ({ ...c, yoByMe: on, yoCount: Math.max(0, c.yoCount + (on ? 1 : -1)) }));
    const res = await postJson(`/api/cards/${card.id}/yo`, { on });
    if (!res.ok) {
      patchCard(card.id, (c) => ({ ...c, yoByMe: !on, yoCount: Math.max(0, c.yoCount + (on ? -1 : 1)) }));
      setError(res.error?.message ?? 'That Yo did not go through.');
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
      toast({ title: removal.kind === 'card' ? 'Card taken down.' : 'Reply taken down.', tone: 'success' });
    } else setError(res.error?.message ?? 'Could not take that down.');
    setRemoval(undefined);
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await apiRequest<InitialFence>('GET', `/api/ranch/${handle}/fence?cursor=${next}`);
    setLoadingMore(false);
    if (res.ok && res.data) {
      const more = res.data.cards;
      setCards((all) => [...all, ...more.filter((m) => !all.some((c) => c.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older cards.');
  }

  function cardMenu(c: WireCard) {
    const items = [
      ...(c.canRemove
        ? [
            {
              id: 'remove',
              label: initial.isOwner ? 'Scrape clean' : 'Take it back',
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
    const label = `More about this card from @${c.author.handle}`;
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
    <div ref={composerRef} id="nail" className="flex scroll-mt-24 flex-col gap-2">
      {initial.review && (
        <p className="text-caption text-text-secondary">
          Cards on this Fence wait for {ownerName} to approve them before others see them.
        </p>
      )}
      <PostCardComposer kind="card" onSubmit={nail} />
    </div>
  ) : undefined;

  return (
    <>
      <Fence
        composer={composer}
        hasMore={next !== null}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
        emptyHint={
          initial.canPost ? 'The Fence is quiet. Nail the first card.' : 'The Fence is quiet for now.'
        }
      >
        {cards.map((c) => (
          <PostCard
            key={c.id}
            author={{ name: c.author.displayName, handle: c.author.handle, tint: c.author.portraitTint }}
            body={c.body}
            createdAt={c.createdAt}
            yoCount={c.yoCount}
            yoActive={c.yoByMe}
            canYo={c.canYo}
            onYo={() => toggleYo(c)}
            {...(c.waiting
              ? { notice: `Waiting for ${initial.isOwner ? 'you' : ownerName} to approve.` }
              : {})}
            replyCount={c.replies.length}
            replies={c.replies.map((r) => (
              <PostCardReply
                key={r.id}
                author={{ name: r.author.displayName, handle: r.author.handle, tint: r.author.portraitTint }}
                body={r.body}
                createdAt={r.createdAt}
                {...(r.waiting ? { notice: 'Waiting for approval.' } : {})}
                actions={
                  r.canRemove ? (
                    <Button
                      variant="ghost"
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
          />
        ))}
      </Fence>
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <ConfirmationDialog
        open={removal !== undefined}
        destructive
        title={removal?.kind === 'reply' ? 'Take this reply down?' : 'Take this card down?'}
        description="It is removed for everyone, together with its replies and Yos. This cannot be undone."
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setRemoval(undefined)}
        onConfirm={confirmRemoval}
      />
      <ReportDialog
        open={reporting !== undefined}
        title="Flag this card"
        endpoint={`/api/cards/${reporting ?? ''}/report`}
        onClose={() => setReporting(undefined)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </>
  );
}
