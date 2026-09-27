'use client';

import { useState } from 'react';
import type { TributePage, TributeView } from '@/modules/tributes';
import { LIMITS } from '@/shared/limits';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { GlossaryHint, TributeCard } from '@/ui/howdy';
import { Button, ClayCard, ConfirmationDialog, EmptyState, Textarea, useToast } from '@/ui/primitives';

type WireTribute = Omit<TributeView, 'createdAt'> & { createdAt: Date | string };
export type InitialTributes = Omit<TributePage, 'tributes'> & { tributes: WireTribute[] };

/**
 * Tributes on a Ranch, pinned one leading. Every Tribute waits for the owner's approval before anyone else sees it —
 * there is no fast path — so the only status shown is honest: "waiting" only ever appears to its own author.
 */
export function TributesSection({
  handle,
  ownerName,
  initial,
}: {
  handle: string;
  ownerName: string;
  initial: InitialTributes;
}) {
  const toast = useToast();
  const [tributes, setTributes] = useState<WireTribute[]>(initial.tributes);
  const [next, setNext] = useState<string | null>(initial.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [body, setBody] = useState('');
  const [giving, setGiving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removal, setRemoval] = useState<string | undefined>();
  const [removing, setRemoving] = useState(false);
  const [pinning, setPinning] = useState<string | undefined>();
  // Fresh server data (e.g. after approving one in "Waiting for you", which refreshes the page) replaces the list;
  // useState alone would keep showing the first render's Tributes.
  const [shownFrom, setShownFrom] = useState(initial);
  if (initial !== shownFrom) {
    setShownFrom(initial);
    setTributes(initial.tributes);
    setNext(initial.nextCursor);
  }

  async function give() {
    const trimmed = body.trim();
    if (!trimmed || giving) return;
    setGiving(true);
    setError(undefined);
    const res = await postJson<{ tribute: WireTribute }>(`/api/porch/${handle}/tributes`, { body: trimmed });
    setGiving(false);
    if (res.ok && res.data) {
      setTributes((all) => [res.data!.tribute, ...all]);
      setBody('');
      toast({ title: 'Tribute sent. It waits for approval.', tone: 'success' });
    } else setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await apiRequest<InitialTributes>('GET', `/api/porch/${handle}/tributes?cursor=${next}`);
    setLoadingMore(false);
    if (res.ok && res.data) {
      const more = res.data.tributes;
      setTributes((all) => [...all, ...more.filter((m) => !all.some((t) => t.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older Tributes.');
  }

  async function confirmRemoval() {
    if (!removal) return;
    setRemoving(true);
    const res = await apiRequest('DELETE', `/api/tributes/${removal}`);
    setRemoving(false);
    if (res.ok || res.status === 404) {
      setTributes((all) => all.filter((t) => t.id !== removal));
      toast({ title: 'Tribute taken down.', tone: 'success' });
    } else setError(res.error?.message ?? 'Could not take that down.');
    setRemoval(undefined);
  }

  async function togglePin(t: WireTribute) {
    setPinning(t.id);
    setError(undefined);
    const res = await apiRequest('PATCH', `/api/tributes/${t.id}`, { pinned: !t.pinned });
    setPinning(undefined);
    if (res.ok) {
      // Only one is pinned, and the pinned one leads (as the server orders them); otherwise keep the order.
      setTributes((all) =>
        all
          .map((x) => (x.id === t.id ? { ...x, pinned: !t.pinned } : { ...x, pinned: false }))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      );
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  return (
    <ClayCard className="flex flex-col gap-4">
      <div className="flex items-center">
        <h2 className="text-title text-text-primary">Tributes</h2>
        <GlossaryHint term="tributes" />
      </div>
      {initial.canGive && (
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <p className="text-caption text-text-secondary">
            Tributes always wait for {ownerName} to approve them before anyone else can read them.
          </p>
          <Textarea
            label="Leave a Tribute"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={LIMITS.TRIBUTE_MAX}
            showCount
            rows={3}
            placeholder="What makes them good people…"
          />
          <Button size="sm" loading={giving} disabled={!body.trim()} onClick={give} className="self-end">
            Leave Tribute
          </Button>
        </div>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {tributes.length === 0 ? (
        <EmptyState
          as="h3"
          icon="📜"
          title="No Tributes yet"
          description={
            initial.canGive ? 'Be the first to leave one.' : `Nobody has left ${ownerName} a Tribute yet.`
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tributes.map((t) => (
            <li key={t.id} className="flex flex-col gap-2">
              <TributeCard
                body={t.body}
                authorHandle={t.author.handle}
                status={t.waiting ? 'pending' : 'published'}
                pinned={t.pinned}
              />
              {(t.canRemove || (initial.isOwner && !t.waiting)) && (
                <div className="flex flex-wrap gap-2">
                  {initial.isOwner && !t.waiting && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={pinning === t.id}
                      onClick={() => togglePin(t)}
                    >
                      {t.pinned ? 'Unpin' : 'Pin to top'}
                    </Button>
                  )}
                  {t.canRemove && (
                    <Button variant="ghost" size="sm" onClick={() => setRemoval(t.id)}>
                      {t.mine ? 'Take it back' : 'Take it down'}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Button variant="secondary" loading={loadingMore} onClick={loadMore} className="self-center">
          Older Tributes
        </Button>
      )}
      <ConfirmationDialog
        open={removal !== undefined}
        destructive
        title="Take this Tribute down?"
        description="It is removed for everyone. This cannot be undone."
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setRemoval(undefined)}
        onConfirm={confirmRemoval}
      />
    </ClayCard>
  );
}
