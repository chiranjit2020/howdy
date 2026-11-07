'use client';

import { useState } from 'react';
import type { TributePage, TributeView } from '@/modules/tributes';
import { LIMITS } from '@/shared/limits';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { cn } from '@/ui/cn';
import { RAIL_TEXT, RailCard } from '@/ui/howdy/rail-card';
import { Button, ConfirmationDialog, Textarea, useToast } from '@/ui/primitives';

type WireTribute = Omit<TributeView, 'createdAt'> & { createdAt: Date | string };
export type InitialTributes = Omit<TributePage, 'tributes'> & { tributes: WireTribute[] };

/** The pinned one and the newest two; the rest are a tap away. */
const SHOWN = 3;

/**
 * Testimonials, at the top of a profile's right panel: short quotes with their writer, the pinned one first. Every one
 * waits for the owner's approval before anyone else sees it — there is no fast path — so "waiting" only ever appears to
 * its own author. Slim by design: writing one opens from a single link, and a profile with none (that you cannot write
 * on) shows no card at all.
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
  const [all, setAll] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [writing, setWriting] = useState(false);
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

  // Nothing to read and nothing to write: no card (the owner still gets one line, so they know what it is).
  if (tributes.length === 0 && !initial.canGive && !initial.isOwner) return null;

  async function give() {
    const trimmed = body.trim();
    if (!trimmed || giving) return;
    setGiving(true);
    setError(undefined);
    const res = await postJson<{ tribute: WireTribute }>(`/api/porch/${handle}/tributes`, { body: trimmed });
    setGiving(false);
    if (res.ok && res.data) {
      setTributes((list) => [res.data!.tribute, ...list]);
      setBody('');
      setWriting(false);
      toast({ title: 'Testimonial sent. It waits for approval.', tone: 'success' });
    } else setError(res.error?.fields?.body ?? res.error?.message ?? 'That did not work. Try again.');
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    const res = await apiRequest<InitialTributes>('GET', `/api/porch/${handle}/tributes?cursor=${next}`);
    setLoadingMore(false);
    if (res.ok && res.data) {
      const more = res.data.tributes;
      setTributes((list) => [...list, ...more.filter((m) => !list.some((t) => t.id === m.id))]);
      setNext(res.data.nextCursor);
    } else setError(res.error?.message ?? 'Could not load older testimonials.');
  }

  async function confirmRemoval() {
    if (!removal) return;
    setRemoving(true);
    const res = await apiRequest('DELETE', `/api/tributes/${removal}`);
    setRemoving(false);
    if (res.ok || res.status === 404) {
      setTributes((list) => list.filter((t) => t.id !== removal));
      toast({ title: 'Testimonial taken down.', tone: 'success' });
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
      setTributes((list) =>
        list
          .map((x) => (x.id === t.id ? { ...x, pinned: !t.pinned } : { ...x, pinned: false }))
          .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
      );
    } else setError(res.error?.message ?? 'That did not work. Try again.');
  }

  const shown = all ? tributes : tributes.slice(0, SHOWN);
  const more = !all && (tributes.length > SHOWN || next !== null);

  return (
    <RailCard
      id="profile-testimonials"
      title="Testimonials"
      action={
        more ? (
          // A full touch target; the negative margins keep the title row from growing.
          <Button variant="link" size="sm" onClick={() => setAll(true)} className="-my-3 -mr-3">
            See all
          </Button>
        ) : undefined
      }
      // Writing one is the extra at the card's foot, under the dashed rule.
      {...(initial.canGive
        ? {
            foot: writing ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  label={`Your testimonial for ${ownerName}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={LIMITS.TRIBUTE_MAX}
                  showCount
                  rows={3}
                  placeholder="What makes them good people…"
                  hint={`${ownerName} approves it before anyone else can read it.`}
                />
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setWriting(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={giving} disabled={!body.trim()} onClick={give}>
                    Send
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="link" size="sm" onClick={() => setWriting(true)} className="-mx-1 self-start">
                Write a testimonial for {ownerName}
              </Button>
            ),
          }
        : {})}
    >
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {tributes.length === 0 && initial.isOwner && (
        <p className={RAIL_TEXT}>
          None yet. Friends can write you one; you approve each before anyone sees it.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-3">
          {shown.map((t) => (
            <li key={t.id} className="flex flex-col gap-1">
              <blockquote className={cn(RAIL_TEXT, 'break-words')}>“{t.body}”</blockquote>
              <p className="flex flex-wrap items-center gap-x-2 text-metadata font-normal text-text-muted">
                <span>— @{t.author.handle}</span>
                {t.pinned && <span className="font-semibold text-text-primary">· Pinned</span>}
                {t.waiting && <span>· Waiting for approval</span>}
                {initial.isOwner && !t.waiting && (
                  <Button variant="link" size="sm" loading={pinning === t.id} onClick={() => togglePin(t)}>
                    {t.pinned ? 'Unpin' : 'Pin'}
                  </Button>
                )}
                {t.canRemove && (
                  <Button variant="link" size="sm" onClick={() => setRemoval(t.id)}>
                    {t.mine ? 'Take it back' : 'Take down'}
                  </Button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {all && next && (
        <Button
          variant="link"
          size="sm"
          loading={loadingMore}
          onClick={loadMore}
          className="-mx-1 self-start"
        >
          Older testimonials
        </Button>
      )}
      <ConfirmationDialog
        open={removal !== undefined}
        destructive
        title="Take this testimonial down?"
        description="It is removed for everyone. This cannot be undone."
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setRemoval(undefined)}
        onConfirm={confirmRemoval}
      />
    </RailCard>
  );
}
