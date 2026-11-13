'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AskView } from '@/modules/asks';
import type { AskOutcome, AskVerdict } from '@/shared/validation/town-halls';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { AskBlock } from '@/ui/howdy/buy-or-wait';
import { ReportDialog } from '@/ui/howdy/report-dialog';
import { RelativeTime } from '@/ui/howdy/time';
import { MoreIcon } from '@/ui/icons';
import { Avatar, Button, ConfirmationDialog, Dropdown, IconButton, useToast } from '@/ui/primitives';

/** Dates arrive as Date objects (first paint) or ISO strings (later pages and actions). */
export type WireAsk = Omit<AskView, 'createdAt'> & { createdAt: Date | string };

/**
 * One public "Buy or wait?" (ADR-066): who asked and when, who it is for, the question card, and — for "everyone"
 * questions — a link to share. The asker can take it down; anyone else can flag it. The server checks every action.
 */
export function AskCard({
  initial,
  signedIn = true,
  onRemoved,
  linkToPage = true,
}: {
  initial: WireAsk;
  signedIn?: boolean;
  onRemoved?: (id: string) => void;
  /** In a list, the time links to the question's own page (its share link). */
  linkToPage?: boolean;
}) {
  const toast = useToast();
  const [ask, setAsk] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [removing, setRemoving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const page = `/buy-or-wait/${ask.id}`;

  async function act(path: string, body: unknown, done: string): Promise<boolean> {
    setError(undefined);
    setBusy(true);
    const res = await postJson<{ ask: WireAsk }>(`/api/asks/${ask.id}/${path}`, body);
    setBusy(false);
    if (res.ok && res.data) {
      setAsk(res.data.ask);
      toast({ title: done, tone: 'success' });
      return true;
    }
    setError(
      res.error?.fields?.reason ??
        res.error?.fields?.note ??
        res.error?.message ??
        'That did not go through.',
    );
    return false;
  }

  async function share() {
    const url = new URL(page, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: `Buy or wait? ${ask.item}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  }

  async function remove() {
    setRemoving(true);
    const res = await apiRequest('DELETE', `/api/asks/${ask.id}`);
    setRemoving(false);
    setConfirming(false);
    if (res.ok || res.status === 404) {
      toast({ title: 'Question taken down.', tone: 'success' });
      onRemoved?.(ask.id);
    } else setError(res.error?.message ?? 'Could not take it down.');
  }

  const menuLabel = `More about this question from @${ask.author.handle}`;
  const items = signedIn
    ? ask.isAsker
      ? [{ id: 'remove', label: 'Take it down', danger: true, onSelect: () => setConfirming(true) }]
      : [{ id: 'report', label: 'Flag trouble…', onSelect: () => setReporting(true) }]
    : [];

  return (
    <article aria-label={`Question from ${ask.author.displayName}`} className="clay flex flex-col gap-3 p-4">
      <header className="flex items-center gap-3">
        <Avatar
          name={ask.author.displayName}
          src={ask.author.portraitUrl}
          tint={ask.author.portraitTint}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">
            {signedIn ? (
              <Link href={`/profile/${ask.author.handle}`} className="text-text-primary">
                {ask.author.displayName}
              </Link>
            ) : (
              ask.author.displayName
            )}
          </p>
          <p className="text-metadata text-text-muted">
            {linkToPage ? (
              <Link href={page} className="text-text-muted">
                <RelativeTime date={ask.createdAt} />
              </Link>
            ) : (
              <RelativeTime date={ask.createdAt} />
            )}
            {' · '}
            {ask.audience === 'everyone' ? 'Everyone' : 'Friends'}
          </p>
        </div>
        {items.length > 0 && (
          <Dropdown
            label={menuLabel}
            align="end"
            items={items}
            trigger={(t) => (
              <IconButton label={menuLabel} {...t}>
                <MoreIcon className="size-5" />
              </IconButton>
            )}
          />
        )}
      </header>

      <AskBlock
        ask={ask}
        why={ask.why}
        busy={busy}
        answerHint={
          ask.audience === 'everyone'
            ? 'Anyone who opens this question sees your name and answer.'
            : 'Their friends who can see this question see your name and answer.'
        }
        {...(signedIn ? {} : { signUpHref: '/signup' })}
        onAnswer={(a: { verdict: AskVerdict; reason: string } | null) =>
          act('answer', a ?? { verdict: null }, a ? 'Answer sent.' : 'Answer taken back.')
        }
        onNote={(note: string) => act('note', { note }, 'Update posted.')}
        onDecide={(outcome: AskOutcome) => act('decide', { outcome }, 'Saved.')}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}

      {ask.audience === 'everyone' && signedIn && (
        <div className="flex flex-wrap items-center gap-x-3">
          <Button variant="link" size="sm" onClick={() => void share()}>
            <span aria-live="polite">{copied ? 'Link copied!' : 'Share link'}</span>
          </Button>
          <span className="text-metadata text-text-muted">Send it on WhatsApp to get more answers.</span>
        </div>
      )}

      <ConfirmationDialog
        open={confirming}
        destructive
        title="Take this question down?"
        description="It is removed for everyone, together with its answers. This cannot be undone."
        confirmLabel="Take it down"
        loading={removing}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
      <ReportDialog
        open={reporting}
        title="Flag this question"
        endpoint={`/api/reports/ask/${ask.id}`}
        onClose={() => setReporting(false)}
        onDone={() => toast({ title: 'Thanks. We will take a look.', tone: 'success' })}
      />
    </article>
  );
}
