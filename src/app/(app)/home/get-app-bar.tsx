'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { BrowserMenuBarsIcon, BrowserMenuIcon, DownloadIcon, ShareIosIcon } from '@/ui/icons';
import { Button } from '@/ui/primitives';
import { canPromptInstall, installedOnThisDevice, onInstallChange, promptInstall } from '@/ui/pwa/pwa';
import {
  ACTION_LABEL,
  chromeIntentUrl,
  GET_APP_COMPACT_COOKIE,
  GET_APP_COMPACT_DAYS,
  SLIM_LABEL,
  installAction,
  installBrowser,
  osOf,
  type InstallBrowser,
} from '@/ui/pwa/install-steps';

/** A browser button drawn inline in a hint, the size of the words around it. */
const Key = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="inline-flex translate-y-0.5 items-center">
    {children}
    {/* Icons are decorative: a screen reader hears the button's name instead ("Tap Share in…"). */}
    <span className="sr-only">{label}</span>
  </span>
);

/** The ONE line for a browser that cannot install from our button. Never a numbered list. */
function hintFor(browser: InstallBrowser): ReactNode {
  switch (browser) {
    case 'ios':
      return (
        <>
          Tap{' '}
          <Key label="Share">
            <ShareIosIcon className="size-5" />
          </Key>{' '}
          in your browser’s bar, then <b>Add to Home Screen</b>.
        </>
      );
    case 'in-app':
      return (
        <>
          To install, open this page in Safari: tap <b>⋯</b>, then <b>Open in Safari</b>.
        </>
      );
    case 'samsung':
      return (
        <>
          Tap{' '}
          <Key label="the menu">
            <BrowserMenuBarsIcon className="size-5" />
          </Key>{' '}
          at the bottom, then <b>Add page to</b> → <b>Home screen</b>.
        </>
      );
    default:
      return (
        <>
          Tap{' '}
          <Key label="the menu">
            <BrowserMenuIcon className="size-5" />
          </Key>{' '}
          {/* Chrome's own words change by version: "Install app" on some, "Add to Home screen" on others. */}
          at the top, then <b>Install app</b> or <b>Add to Home screen</b>.
        </>
      );
  }
}

/**
 * "Get the Howdy app", at the top of Home on phones (2026-11-11). It replaced the island that dropped in to ask: nearly
 * everyone closed that pop-up by reflex, so the offer now sits in the page, where it waits instead of interrupting.
 *
 * One thing to do per browser (install-steps.ts): Android Chrome installs in one tap (the browser's own box); inside
 * Instagram & co on Android the button opens Chrome; iPhone gets one line with the Share icon (Apple lets no website
 * install itself). The server reads the phone from the user agent (`ua`), so the right button is there from the first
 * paint. "Not now" never removes it: it shrinks to one slim line saying what they miss, with a small Install button,
 * and stays that way (a cookie, so the server draws it slim and nothing jumps). It goes away only once the installed
 * app has been opened (on the account); the installed app itself never shows it (CSS: display-mode standalone).
 */
export function GetAppBar({ ua, compact: startCompact = false }: { ua: string; compact?: boolean }) {
  const offer = useSyncExternalStore(onInstallChange, canPromptInstall, () => false);
  const os = osOf(ua);
  const browser = installBrowser(ua, os, offer);
  const action = installAction(browser, os);
  const [gone, setGone] = useState(false);
  const [compact, setCompact] = useState(startCompact);
  // Shown after a tap when the browser cannot install from our button (and straight away when there is no button).
  const [hint, setHint] = useState(action === 'none' && !startCompact);
  // After "Not now", the keyboard lands on the slim line's button, not on the page's top.
  const slimButton = useRef<HTMLButtonElement>(null);
  const shrunkByTap = useRef(false);

  useEffect(() => {
    const off = () => setGone(true);
    window.addEventListener('appinstalled', off);
    // Already installed on this phone (Android Chrome can tell): step aside — Chrome will not offer it again.
    let live = true;
    void installedOnThisDevice().then((yes) => live && yes && setGone(true));
    return () => {
      live = false;
      window.removeEventListener('appinstalled', off);
    };
  }, []);
  useEffect(() => {
    if (compact && shrunkByTap.current) slimButton.current?.focus();
  }, [compact]);

  if (gone) return null;

  async function go() {
    if (action === 'open-chrome') {
      window.location.href = chromeIntentUrl(window.location.href);
      return;
    }
    if (browser === 'offer') {
      // Yes: the browser fires `appinstalled`, which hides the bar and tells the account (PwaBoot).
      if (await promptInstall()) setGone(true);
      return;
    }
    setHint(true);
  }

  function notNow() {
    document.cookie = `${GET_APP_COMPACT_COOKIE}=1; Max-Age=${GET_APP_COMPACT_DAYS * 86_400}; Path=/; SameSite=Lax; Secure`;
    shrunkByTap.current = true;
    setHint(false);
    setCompact(true);
  }

  if (compact) {
    return (
      <section
        aria-label="Get the Howdy app"
        // The same blue as the full card, slim: one line, no close, nothing that moves. It stays until Howdy is
        // installed, quietly saying what is missed without the app.
        className="clay flex flex-col gap-2 bg-header-deep! px-3 py-2 text-on-header [@media(display-mode:standalone)]:hidden"
      >
        <div className="flex items-center gap-2.5">
          <Img
            src="/icons/howdy-bubble-192.png"
            width={28}
            height={28}
            alt=""
            loading="eager"
            className="size-7 shrink-0 rounded-lg"
          />
          <p className="min-w-0 flex-1 text-caption">
            {action === 'none'
              ? 'Open Howdy in Safari to get the app.'
              : 'You’re missing message notifications.'}
          </p>
          {action !== 'none' && (
            <Button
              ref={slimButton}
              size="sm"
              onClick={() => void go()}
              // A one-word label on a 44 px tall pill made a near-circle: the icon, wider padding and a minimum width keep
              // it a clear pill (longer than tall) whatever the word.
              className="min-w-28 shrink-0 gap-1.5 border-b-[3px] border-highlight-edge px-4 font-bold active:translate-y-px active:border-b-2"
            >
              <DownloadIcon className="size-4" />
              {SLIM_LABEL[action]}
            </Button>
          )}
        </div>
        <p role="status" className="text-caption empty:-mt-2">
          {hint ? hintFor(browser) : null}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="get-app-title"
      // The one blue card on a page of white ones (2026-11-11: it must draw the eye without moving): the top bar's blue
      // one step deeper, which carries small white words (4.9:1), with the Sunflower button standing out on it.
      className="clay flex flex-col gap-3 bg-header-deep! p-4 text-on-header [@media(display-mode:standalone)]:hidden"
    >
      <div className="flex items-start gap-3">
        <Img
          src="/icons/howdy-bubble-192.png"
          width={48}
          height={48}
          alt=""
          loading="eager"
          className="size-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <h2 id="get-app-title" className="text-title">
            Get the Howdy app
          </h2>
          <p className="text-caption">Full screen, faster, with notifications.</p>
        </div>
        {/* Quiet, in the corner: small words, no row of its own. The 44 px tap area overlaps the card's padding. */}
        <button
          type="button"
          onClick={notNow}
          className="-mt-3 -mr-3 inline-flex min-h-11 shrink-0 items-center px-3 text-metadata font-normal"
        >
          Not now
        </button>
      </div>
      {action !== 'none' && (
        <Button
          size="lg"
          fullWidth
          onClick={() => void go()}
          // A key standing on the card (the user's ask, 2026-11-11): a darker Sunflower edge 4 px below only, as its
          // side; a thin light line on top as if lit from above; a soft shadow on the blue. Pressed, it sinks the 2 px it
          // stood up (the edge below thins as it moves down), so a tap feels like pressing a real button.
          className={cn(
            'gap-2 border-b-4 border-highlight-edge font-bold',
            'shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_6px_14px_-4px_rgb(0_20_60/0.45)]',
            'transition-transform duration-75 active:translate-y-0.5 active:border-b-2',
          )}
        >
          <DownloadIcon className="size-5" />
          {ACTION_LABEL[action]}
        </Button>
      )}
      {/* Announced when it appears after a tap, so a screen reader hears what to do next. */}
      {/* Empty, it takes no room: the negative margin cancels the card's gap above it. */}
      <p role="status" className="text-caption empty:-mt-3">
        {hint ? hintFor(browser) : null}
      </p>
    </section>
  );
}
