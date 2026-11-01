'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { postJson } from '../auth/api';
import { cn } from '../cn';
import { CameraIcon, CapsuleIcon, DevicesIcon, PencilIcon, SignOutIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { Drawer } from '../primitives/dialog';
import type { ShellMe } from './app-shell';
import { FreeDot, FreeToTalkDialog, freeToTalkSummary, type FreeToTalkState } from './free-to-talk-menu';
import { offerStoryFile } from './pending-story';

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

/**
 * The phone's ＋: write a post (Home's "What's on your mind?", with the cursor in it), add to your Story (the photo is
 * picked right here, since a browser opens its picker only from a tap, then Home's Stories take over), or seal a Time
 * Capsule.
 */
export function CreateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <Drawer side="bottom" open={open} onClose={onClose} title="Create">
      <ul className="-mx-2 -mt-2 flex flex-col">
        <li>
          <button type="button" className={ROW} onClick={() => go(`/home?nail=${Date.now()}`)}>
            <RowIcon>
              <PencilIcon />
            </RowIcon>
            <RowText title="Write a post" line="On your wall, for your friends’ feeds" />
          </button>
        </li>
        <li>
          {/* A label, so the tap itself opens the photo picker. */}
          <label
            className={cn(
              ROW,
              'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent',
            )}
          >
            <RowIcon>
              <CameraIcon />
            </RowIcon>
            <RowText title="Add to your Story" line="A photo for 12 hours" />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                e.target.value = '';
                if (!chosen) return;
                offerStoryFile(chosen);
                onClose();
                if (pathname !== '/home') router.push('/home');
              }}
            />
          </label>
        </li>
        <li>
          <button type="button" className={ROW} onClick={() => go('/capsules')}>
            <RowIcon>
              <CapsuleIcon />
            </RowIcon>
            <RowText title="Seal a Time Capsule" line="Words that open on a day you pick" />
          </button>
        </li>
      </ul>
    </Drawer>
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
 * Your photo in the phone's tab bar opens this: your profile at the top, then Free to talk, the pages that are not tabs
 * (Visitors, Groups, staff pages, Settings), Devices and Sign out. It replaces the old "More" menu in the top bar.
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
      <Drawer side="bottom" open={open} onClose={onClose} title="You">
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
            <Link href="/settings/account#devices" onClick={onClose} className={ROW}>
              <RowIcon>
                <DevicesIcon />
              </RowIcon>
              <RowText title="Devices" />
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
