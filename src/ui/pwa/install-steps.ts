/**
 * Which way into the app each browser gets (2026-11-11). Decided from the user agent, the same on the server (so the
 * right button is in the first HTML) and in the phone; only ever used to pick words and the button, never to gate
 * anything. One thing to do per browser, never a numbered list: people skip instructions.
 */

export type PhoneOs = 'ios' | 'android' | 'other';

/** The phone's system, from a user agent. (iPads that call themselves a Mac read as 'other': they get no bar.) */
export function osOf(ua: string): PhoneOs {
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export type InstallBrowser = 'offer' | 'ios' | 'samsung' | 'firefox' | 'in-app' | 'chromium';

/** `offer`: the browser handed us its own one-tap install (Android Chrome, Edge, sometimes Samsung). It always wins. */
export function installBrowser(ua: string, os: PhoneOs, offer: boolean): InstallBrowser {
  if (offer) return 'offer';
  // Instagram, Facebook, LinkedIn, Snapchat… open links in a small browser of their own that cannot install anything.
  if (/FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|; wv\)/.test(ua)) return 'in-app';
  if (os === 'ios') return 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  return 'chromium';
}

/**
 * What the big button does:
 * - `install`: the browser's own install box (or, when it did not offer one, a one-line hint);
 * - `home-screen`: iPhone — no website may install itself there, so a one-line hint with the Share icon;
 * - `open-chrome`: inside Instagram & co on Android — open this page in Chrome, where one-tap install works;
 * - `none`: inside Instagram & co on iPhone — no button, just the one line saying to open it in Safari.
 */
export type InstallAction = 'install' | 'home-screen' | 'open-chrome' | 'none';

export function installAction(browser: InstallBrowser, os: PhoneOs): InstallAction {
  if (browser === 'in-app') return os === 'android' ? 'open-chrome' : 'none';
  if (browser === 'ios') return 'home-screen';
  return 'install';
}

/** The words on the big button for each action (`none` has no button). */
export const ACTION_LABEL: Record<Exclude<InstallAction, 'none'>, string> = {
  install: 'Install Howdy',
  'home-screen': 'Add to Home Screen',
  'open-chrome': 'Open in Chrome',
};

/**
 * Android's way to open a page in Chrome from inside another app's browser: an `intent:` link naming Chrome. If Chrome
 * is missing, Android falls back to the page itself.
 */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

/** A phone, from the request's user agent (server side): only phones get Home's "Get the Howdy app" bar. */
export const isPhoneAgent = (ua: string | null) => !!ua && osOf(ua) !== 'other';

/** The slim line's small button: the same action in fewer words (iPhone's tap shows the Share hint). */
export const SLIM_LABEL: Record<Exclude<InstallAction, 'none'>, string> = {
  install: 'Install',
  'home-screen': 'Install',
  'open-chrome': 'Open in Chrome',
};

/**
 * "Not now" on the bar shrinks it to one slim line, for good (until Howdy is installed): a cookie, so the server draws
 * it slim from the first paint and nothing jumps.
 */
export const GET_APP_COMPACT_COOKIE = 'howdy_get_app_compact';
export const GET_APP_COMPACT_DAYS = 365;
