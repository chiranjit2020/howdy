'use client';

import { useEffect } from 'react';
import { Art } from '../art/glyph';
import { Button } from '../primitives';
import { dismissActivity, showActivity } from '../island/store';
import { enablePush, isInstalled, platform, pushState } from './pwa';

const ID = 'chimes';
/** Once dismissed (or refused), the island does not ask again on this device for this long. */
export const CHIMES_SNOOZE_MS = 14 * 86_400_000;
const KEY = 'howdy.island.chimes.dismissedAt';
const SHOW_AFTER_MS = 4000;

function snoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < CHIMES_SNOOZE_MS;
  } catch {
    return false;
  }
}
function snooze() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode: it will simply ask again next visit */
  }
}

/**
 * Signed in, on a phone whose notifications for Howdy are neither on nor refused: puts "Get Chimes on this phone" in the
 * Dynamic Island (ADR-034). The browser's own permission dialog appears only after a tap on the button, never on
 * landing. iPhones can get notifications only from the installed app, so there it waits until Howdy is installed.
 * Ranks below the install offer, so on a phone that has neither, installing is asked first. Renders nothing itself.
 */
export function ChimesIsland({ vapidKey }: { vapidKey: string | undefined }) {
  useEffect(() => {
    if (!vapidKey || snoozed()) return;
    const os = platform();
    if (os === 'other' || (os === 'ios' && !isInstalled())) return;
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if ((await pushState()) !== 'off' || cancelled) return;
      showActivity({
        id: ID,
        priority: 5,
        icon: <Art name="nav-chimes" size="free" className="size-6" />,
        label: 'Get Chimes on this phone',
        autoExpandMs: 1200,
        onDismiss: snooze,
        expanded: () => (
          <div className="flex flex-col gap-3">
            <p className="text-caption text-on-island-muted">
              Hear about Whispers, replies and Pal requests even when Howdy is closed. You can switch kinds
              off in Chimes.
            </p>
            <Button
              size="sm"
              className="self-start"
              onClick={async () => {
                const state = await enablePush(vapidKey).catch(() => 'off' as const);
                // Done either way: on, or the browser said no (only its settings can undo that). Not asked again soon.
                if (state !== 'on') snooze();
                dismissActivity(ID);
              }}
            >
              Turn on Chimes
            </Button>
          </div>
        ),
      });
    }, SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [vapidKey]);
  return null;
}
