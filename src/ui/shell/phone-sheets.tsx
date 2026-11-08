'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { postJson } from '../auth/api';
import { cn } from '../cn';
import { CapsuleIcon, DevicesIcon, FeedbackIcon, SignOutIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { Drawer } from '../primitives/dialog';
import type { ShellMe } from './app-shell';
import { FreeDot, FreeToTalkDialog, freeToTalkSummary, type FreeToTalkState } from './free-to-talk-menu';

/** One row in a phone sheet: an icon in a soft tile, the words, and (optionally) a line under them or a count. */
const ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-body text-text-primary no-underline hover:bg-surface-sunken hover:no-underline';

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-sunken text-title text-text-secondary"
    >
      {children}
    </span>
  );
}

function RowText({ title, line }: { title: string; line?: string | undefined }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-semibold">{title}</span>
      {line && <span className="truncate text-caption text-text-secondary">{line}</span>}
    </span>
  );
}

/** A count at the end of a row, the same sunflower pill as the sidebar's; screen readers hear what it counts. */
function Count({ n, says }: { n: number; says: string }) {
  return (
    <span className="rounded-pill bg-highlight px-2 text-metadata font-bold text-on-highlight">
      {n > 99 ? '99+' : n}
      <span className="sr-only"> {says}</span>
    </span>
  );
}

export interface YouLink {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number | undefined;
  badgeSays?: string | undefined;
}

/**
 * Your photo in the phone's tab bar (Profile) opens this: your profile at the top, then Free to talk, the pages that are not tabs
 * (Visitors, Groups, staff pages, Settings), Time Capsules (2026-11-08, from the retired Create sheet), Devices and Sign
 * out. It replaces the old "More" menu in the top bar.
 */
export function YouSheet({
  open,
  onClose,
  me,
  links,
  freeToTalk,
}: {
  open: boolean;
  onClose: () => void;
  me: ShellMe;
  links: YouLink[];
  freeToTalk?: FreeToTalkState | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [talkOpen, setTalkOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const talk = freeToTalk ? freeToTalkSummary(freeToTalk) : null;
  const freeFriends = freeToTalk?.lit.length ?? 0;

  async function signOut() {
    setLeaving(true);
    await postJson('/api/auth/logout', {});
    router.push('/gate');
    router.refresh();
  }

  return (
    <>
      {freeToTalk && (
        <FreeToTalkDialog state={freeToTalk} open={talkOpen} onClose={() => setTalkOpen(false)} />
      )}
      <Drawer side="bottom" open={open} onClose={onClose} title="Profile">
        <div className="-mx-2 -mt-2 flex flex-col gap-1">
          <Link href={`/profile/${me.handle}`} onClick={onClose} className={ROW}>
            <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="md" />
            <RowText title={me.displayName} line={`@${me.handle} · View your profile`} />
          </Link>
          <nav aria-label="More pages" className="flex flex-col border-t border-border pt-1">
            {talk && freeToTalk && (
              <button
                type="button"
                className={ROW}
                aria-label={talk.spoken}
                onClick={() => {
                  onClose();
                  setTalkOpen(true);
                }}
              >
                <RowIcon>
                  <FreeDot on={Boolean(freeToTalk.mine)} />
                </RowIcon>
                <RowText title={talk.label} />
                {freeFriends > 0 && <Count n={freeFriends} says="free now" />}
              </button>
            )}
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={onClose} className={ROW}>
                <RowIcon>{l.icon}</RowIcon>
                <RowText title={l.label} />
                {l.badge ? <Count n={l.badge} says={l.badgeSays ?? 'new'} /> : null}
              </Link>
            ))}
            <Link href="/capsules" onClick={onClose} className={ROW}>
              <RowIcon>
                <CapsuleIcon />
              </RowIcon>
              <RowText title="Time Capsules" />
            </Link>
            <Link href="/settings/account#devices" onClick={onClose} className={ROW}>
              <RowIcon>
                <DevicesIcon />
              </RowIcon>
              <RowText title="Devices" />
            </Link>
            <Link href={`/feedback?from=${encodeURIComponent(pathname)}`} onClick={onClose} className={ROW}>
              <RowIcon>
                <FeedbackIcon />
              </RowIcon>
              <RowText title="Send feedback" />
            </Link>
          </nav>
          <div className="border-t border-border pt-1">
            <button
              type="button"
              className={cn(ROW, 'disabled:text-text-muted')}
              onClick={() => void signOut()}
              disabled={leaving}
              aria-busy={leaving || undefined}
            >
              <RowIcon>
                <SignOutIcon />
              </RowIcon>
              <RowText title={leaving ? 'Signing out…' : 'Sign out'} />
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
