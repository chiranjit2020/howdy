'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { postJson } from '../auth/api';
import { cn } from '../cn';
import { CapsuleIcon, ChevronRightIcon, DevicesIcon, FeedbackIcon, SignOutIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { Drawer } from '../primitives/dialog';
import type { ShellMe } from './app-shell';
import { FreeDot, FreeToTalkDialog, freeToTalkSummary, type FreeToTalkState } from './free-to-talk-menu';
import type { ShellNavKey } from './nav';

/**
 * One row of the Profile sheet (the user's design, 2026-11-10): a 48 px tinted tile with its icon, the words, then a
 * count if there is one and a chevron. Tints are the palette's own soft tokens only (no new colours).
 */
const ROW =
  'flex min-h-14 w-full items-center gap-4 rounded-lg px-2 py-1 text-left text-title text-text-primary no-underline hover:bg-surface-sunken hover:no-underline';

type Tone = 'sunflower' | 'navy' | 'blue' | 'cyan' | 'red' | 'green' | 'grey';
const TONE: Record<Tone, string> = {
  sunflower: 'bg-primary-soft text-text-primary',
  navy: 'bg-accent-soft text-accent',
  blue: 'bg-accent-soft text-link',
  cyan: 'bg-info text-on-info',
  red: 'bg-danger-soft text-danger',
  green: 'bg-success text-success-text',
  grey: 'bg-surface-sunken text-danger',
};
/** Each page's tile, as in the design: Visitors and Settings blue, Groups and Time Capsules navy, staff red and green. */
const TONE_OF: Partial<Record<ShellNavKey, Tone>> = {
  tracks: 'blue',
  'town-halls': 'navy',
  moderation: 'red',
  security: 'green',
  workshop: 'blue',
};

function RowIcon({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid size-12 shrink-0 place-items-center rounded-xl [&_svg]:size-6', TONE[tone])}
    >
      {children}
    </span>
  );
}

function RowText({ title, className }: { title: string; className?: string }) {
  return <span className={cn('min-w-0 flex-1 truncate font-semibold', className)}>{title}</span>;
}

function Chevron() {
  return <ChevronRightIcon className="size-5 shrink-0 text-text-secondary" />;
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

/** The dashed line between groups (the card system's divider for "the next kind of thing"). */
const GROUP = 'flex flex-col border-t border-dashed border-border py-1';

export interface YouLink {
  key: ShellNavKey;
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number | undefined;
  badgeSays?: string | undefined;
}

/**
 * Your photo in the phone's tab bar (Profile) opens this, in groups split by dashed lines: your profile; Free to talk;
 * Visitors and Groups; the staff pages (staff only); Settings, Time Capsules and Devices; Send feedback; Sign out.
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

  const pageRow = (l: YouLink) => (
    <Link key={l.href} href={l.href} onClick={onClose} className={ROW}>
      <RowIcon tone={TONE_OF[l.key] ?? 'navy'}>{l.icon}</RowIcon>
      <RowText title={l.label} />
      {l.badge ? <Count n={l.badge} says={l.badgeSays ?? 'new'} /> : null}
      <Chevron />
    </Link>
  );
  const settings = links.find((l) => l.key === 'workshop');
  // Visitors and Groups, then the staff pages: each group only when it has something in it.
  const groups = [
    links.filter((l) => l.key === 'tracks' || l.key === 'town-halls'),
    links.filter((l) => l.key === 'moderation' || l.key === 'security'),
  ].filter((g) => g.length > 0);

  return (
    <>
      {freeToTalk && (
        <FreeToTalkDialog state={freeToTalk} open={talkOpen} onClose={() => setTalkOpen(false)} />
      )}
      <Drawer side="bottom" open={open} onClose={onClose} title="Profile">
        <div className="-mx-2 -mt-1 flex flex-col">
          <Link href={`/profile/${me.handle}`} onClick={onClose} className={cn(ROW, 'mb-1 py-2')}>
            <Avatar name={me.displayName} src={me.portraitUrl} tint={me.portraitTint} size="lg" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-heading font-semibold">{me.displayName}</span>
              <span className="truncate text-body text-text-secondary">@{me.handle} · View your profile</span>
            </span>
            <Chevron />
          </Link>
          <nav aria-label="More pages" className="flex flex-col border-t border-border">
            {talk && freeToTalk && (
              <div className="flex flex-col py-1">
                <button
                  type="button"
                  className={ROW}
                  aria-label={talk.spoken}
                  onClick={() => {
                    onClose();
                    setTalkOpen(true);
                  }}
                >
                  <RowIcon tone="sunflower">
                    <FreeDot on={Boolean(freeToTalk.mine)} />
                  </RowIcon>
                  <RowText title={talk.label} />
                  {freeFriends > 0 && <Count n={freeFriends} says="free now" />}
                  <Chevron />
                </button>
              </div>
            )}
            {groups.map((g, i) => (
              <div key={i} className={cn(GROUP, !talk && i === 0 && 'border-t-0')}>
                {g.map(pageRow)}
              </div>
            ))}
            <div className={GROUP}>
              {settings && pageRow(settings)}
              <Link href="/capsules" onClick={onClose} className={ROW}>
                <RowIcon tone="navy">
                  <CapsuleIcon />
                </RowIcon>
                <RowText title="Time Capsules" />
                <Chevron />
              </Link>
              <Link href="/settings/account#devices" onClick={onClose} className={ROW}>
                <RowIcon tone="cyan">
                  <DevicesIcon />
                </RowIcon>
                <RowText title="Devices" />
                <Chevron />
              </Link>
            </div>
            <div className={GROUP}>
              <Link href={`/feedback?from=${encodeURIComponent(pathname)}`} onClick={onClose} className={ROW}>
                <RowIcon tone="sunflower">
                  <FeedbackIcon />
                </RowIcon>
                <RowText title="Send feedback" />
                <Chevron />
              </Link>
            </div>
          </nav>
          <div className={GROUP}>
            <button
              type="button"
              className={ROW}
              onClick={() => void signOut()}
              disabled={leaving}
              aria-busy={leaving || undefined}
            >
              <RowIcon tone="grey">
                <SignOutIcon />
              </RowIcon>
              <RowText
                title={leaving ? 'Signing out…' : 'Sign out'}
                className={leaving ? 'text-text-muted' : 'text-danger'}
              />
              <Chevron />
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
