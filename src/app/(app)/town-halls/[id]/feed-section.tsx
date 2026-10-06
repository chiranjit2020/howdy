'use client';

import { useId, useState } from 'react';
import type { HallFeedPage, HallPostView, HallReplyView, HeldItems } from '@/modules/town-halls';
import { dayOf, longDay } from '@/shared/calendar';
import type { ReactionKind } from '@/shared/validation/fence';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { PostCard, PostCardComposer, PostCardReply, type PostCardAuthor } from '@/ui/howdy';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { RelativeTime } from '@/ui/howdy/time';
import {
  Button,
  ClayCard,
  ConfirmationDialog,
  Dropdown,
  EmptyState,
  IconButton,
  useToast,
} from '@/ui/primitives';

/** Dates arrive as Date objects (first paint) or ISO strings (later pages). */
type WireReply = Omit<HallReplyView, 'createdAt'> & { createdAt: Date | string };
type WirePost = Omit<HallPostView, 'createdAt' | 'replies'> & {
  createdAt: Date | string;
  replies: WireReply[];
};
export type InitialFeed = Omit<HallFeedPage, 'posts'> & { posts: WirePost[] };
type WireHeld = {
  posts: (Omit<HeldItems['posts'][number], 'createdAt'> & { createdAt: Date | string })[];
  replies: (Omit<HeldItems['replies'][number], 'createdAt'> & { createdAt: Date | string })[];
};
export type InitialHeld = WireHeld;

type Removal = { kind: 'post' | 'reply'; id: string };

const authorOf = (a: HallPostView['author']): PostCardAuthor => ({
  name: a.displayName,
  handle: a.handle,
  tint: a.portraitTint,
  avatarUrl: a.portraitUrl,
  verified: a.verified,
  trusted: a.trusted,
});

/**
 * A Town Hall's feed (ADR-033), for its active members. As on the Fence, the buttons that show are hints from the server
 * (`canReact`, `canReply`, `canRemove`) and every action is re-checked there.
 */
export function FeedSection({
  townHallId,
  isOwner,
  initial,
  initialHeld,
}: {
  townHallId: string;
  isOwner: boolean;
  initial: InitialFeed;
  initialHeld: InitialHeld | null;
}) {
  const toast = useToast();
  const headingId = useId();
  const [posts, setPosts] = useState<WirePost[]>(initial.posts);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removal, setRemoval] = useState<Removal | undefined>();
  const [removing, setRemoving] = useState(false);
  const [reporting, setReporting] = useState<string | undefined>();

  const patchPost = (id: string, fn: (p: WirePost) => WirePost) =>
    setPosts((all) => all.map((p) => (p.id === id ? fn(p) : p)));

  async function post(body: string): Promise<boolean> {
    setError(undefined);
    const res = await postJson<{ post: WirePost }>(`/api/town-halls/${townHallId}/posts`, { body });
    if (res.ok && res.data) {
      const made = res.data.post;
      setPosts((all) => [made, ...all]);
      return true;
    }
    setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
    return false;
  }

  async function reply(postId: string, body: string): Promise<boolean> {
    setError(undefined);
    const res = await postJson<{ reply: WireReply }>(`/api/hall-posts/${postId}/replies`, { body });
    if (res.ok && res.data) {
      const made = res.data.reply;
      patchPost(postId, (p) => ({ ...p, replies: [...p.replies, made] }));
      return true;
    }
    setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
    return false;
  }

  /** Give, switch or take back the viewer's reaction: shown at once, put back if the server says no. */
  async function react(p: WirePost, kind: ReactionKind | null) {
    const before = { myReaction: p.myReaction, reactions: p.reactions };
    const set = (mine: ReactionKind | null, reactions: Record<ReactionKind, number>) =>
      patchPost(p.id, (x) => ({ ...x, myReaction: mine, reactions }));
    const counts = { ...p.reactions };
    if (p.myReaction) counts[p.myReaction] = Math.max(0, counts[p.myReaction] - 1);
    if (kind) counts[kind] += 1;
    setError(undefined);
    set(kind, counts);
    const res = await postJson(`/api/hall-posts/${p.id}/react`, kind ? { on: true, kind } : { on: false });
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
      `/api/${removal.kind === 'post' ? 'hall-posts' : 'hall-replies'}/${removal.id}`,
    );
    setRemoving(false);
    if (res.ok || res.status === 404) {
      if (removal.kind === 'post') setPosts((all) => all.filter((p) => p.id !== removal.id));
      else
        setPosts((all) => all.map((p) => ({ ...p, replies: p.replies.filter((r) => r.id !== removal.id) })));
      toast({ title: removal.kind === 'post' ? 'Post taken down.' : 'Reply taken down.', tone: 'success' });
    } else setError(res.error?.message ?? 'Could not take that down.');
    setRemoval(undefined);
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await apiRequest<InitialFeed>('GET', `/api/town-halls/${townHallId}/posts?cursor=${next}`);
    setLoadingMore(false);
    if (res.ok && res.data) {
      const more = res.data.posts;
      setPosts((all) => [...all, ...more.filter((m) => !all.some((p) => p.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older posts.');
  }

  /**
   * Pull the newest page again: add what is new (an approved post is bumped to "now") and refresh what is already shown
   * (an approved reply). The list is this component's own state, so a page refresh would not do it.
   */
  async function refreshNewest() {
    const res = await apiRequest<InitialFeed>('GET', `/api/town-halls/${townHallId}/posts`);
    if (res.ok && res.data) {
      const fresh = res.data.posts;
      const byId = new Map(fresh.map((f) => [f.id, f]));
      setPosts((all) => [
        ...fresh.filter((f) => !all.some((p) => p.id === f.id)),
        ...all.map((p) => byId.get(p.id) ?? p),
      ]);
    }
  }

  function postMenu(p: WirePost) {
    const items = [
      ...(p.canRemove
        ? [
            {
              id: 'remove',
              label: p.mine ? 'Take it back' : 'Take it down',
              danger: true,
              onSelect: () => setRemoval({ kind: 'post', id: p.id }),
            },
          ]
        : []),
      ...(!p.mine ? [{ id: 'report', label: 'Flag trouble…', onSelect: () => setReporting(p.id) }] : []),
    ];
    if (items.length === 0) return undefined;
    const label = `More about this post from @${p.author.handle}`;
    return (
      <Dropdown
        label={label}
        align="end"
        items={items}
        trigger={(t) => (
          <IconButton label={label} {...t}>
            ⋯
          </IconButton>
        )}
      />
    );
  }

  return (
    <>
      {isOwner && initialHeld && <HeldTray initial={initialHeld} onApproved={refreshNewest} />}

      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <h2 id={headingId} className="font-display text-heading text-text-primary">
          The feed
        </h2>
        <PostCardComposer kind="post" onSubmit={post} />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {posts.length === 0 ? (
          <EmptyState
            as="h3"
            icon="🏛️"
            title="Nothing posted yet"
            description="Say howdy to the Town Hall. Only members can see what is posted here."
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard
                  noun="Post"
                  author={authorOf(p.author)}
                  body={p.body}
                  createdAt={p.createdAt}
                  {...(p.capsuleSealedAt
                    ? {
                        stamp: 'Time Capsule',
                        notice: `Sealed on ${longDay(dayOf(new Date(p.capsuleSealedAt)))}`,
                      }
                    : {})}
                  reactions={p.reactions}
                  myReaction={p.myReaction}
                  canReact={p.canReact}
                  onReact={(kind) => react(p, kind)}
                  replyCount={p.replies.length}
                  replies={p.replies.map((r) => (
                    <PostCardReply
                      key={r.id}
                      author={authorOf(r.author)}
                      body={r.body}
                      createdAt={r.createdAt}
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
                  {...(p.canReply
                    ? { replyComposer: <PostCardComposer kind="reply" onSubmit={(b) => reply(p.id, b)} /> }
                    : {})}
                  actions={postMenu(p)}
                />
              </li>
            ))}
          </ol>
        )}
        {next && (
          <Button variant="secondary" onClick={loadMore} loading={loadingMore} className="self-center">
            Older posts
          </Button>
        )}
      </section>

      <ConfirmationDialog
        open={removal !== undefined}
        destructive
        title={removal?.kind === 'reply' ? 'Take this reply down?' : 'Take this post down?'}
        description={
          removal?.kind === 'reply'
            ? 'It is removed for everyone. This cannot be undone.'
            : 'It is removed for everyone, together with its replies and reactions. This cannot be undone.'
        }
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setRemoval(undefined)}
        onConfirm={confirmRemoval}
      />
      <ReportDialog
        open={reporting !== undefined}
        title="Flag this post"
        endpoint={`/api/reports/hall-post/${reporting ?? ''}`}
        onClose={() => setReporting(undefined)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </>
  );
}

/**
 * The owner's tray of held posts and replies (ADR-024 auto-hold). Approving lets one through; removing takes it down.
 * Their writers were never told, so nothing tells them either way.
 */
function HeldTray({ initial, onApproved }: { initial: WireHeld; onApproved: () => void }) {
  const [held, setHeld] = useState<WireHeld>(initial);
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  if (held.posts.length === 0 && held.replies.length === 0) return null;

  async function decide(kind: 'post' | 'reply', id: string, approve: boolean) {
    setBusy(`${id}:${approve}`);
    setError(undefined);
    const base = kind === 'post' ? 'hall-posts' : 'hall-replies';
    const res = approve
      ? await postJson(`/api/${base}/${id}/approve`, {})
      : await apiRequest('DELETE', `/api/${base}/${id}`);
    setBusy(undefined);
    if (res.ok || res.status === 404) {
      setHeld((h) =>
        kind === 'post'
          ? { ...h, posts: h.posts.filter((p) => p.id !== id) }
          : { ...h, replies: h.replies.filter((r) => r.id !== id) },
      );
      if (approve) onApproved();
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  const row = (
    kind: 'post' | 'reply',
    item: { id: string; body: string; createdAt: Date | string; author: HallPostView['author'] },
    onPost?: string,
  ) => (
    <li key={item.id} className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3">
      <p className="text-metadata [overflow-wrap:anywhere] text-text-muted">
        <span className="font-semibold text-text-secondary">@{item.author.handle}</span> ·{' '}
        <RelativeTime date={item.createdAt} />
        {onPost && <> · on “{onPost}”</>}
      </p>
      <p className="text-body break-words whitespace-pre-wrap text-text-primary">{item.body}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          loading={busy === `${item.id}:true`}
          onClick={() => decide(kind, item.id, true)}
          aria-label={`Let the ${kind} from @${item.author.handle} through`}
        >
          Let it through
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={busy === `${item.id}:false`}
          onClick={() => decide(kind, item.id, false)}
          aria-label={`Remove the ${kind} from @${item.author.handle}`}
        >
          Remove
        </Button>
      </div>
    </li>
  );

  return (
    <ClayCard className="flex flex-col gap-3">
      <h2 className="text-title text-text-primary">Waiting for you</h2>
      <p className="text-caption text-text-secondary">
        Several people have flagged these writers lately, so their words wait for your OK. To them it looks
        posted.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <ul className="flex flex-col gap-3">
        {held.posts.map((p) => row('post', p))}
        {held.replies.map((r) => row('reply', r, r.onPost))}
      </ul>
    </ClayCard>
  );
}
