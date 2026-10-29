'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile on the page (the server half is modules/auth/turnstile.ts). Most people never see it: it is
 * `interaction-only`, so a box appears only when Cloudflare wants one click. Its script is loaded from our own code, which
 * the Content-Security-Policy trusts ('strict-dynamic'); the CSP also allows its frame.
 */

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile')));
    s.onerror = () => {
      loading = undefined; // let a later visit try again
      reject(new Error('turnstile did not load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Calls `onToken` with a fresh token once Cloudflare is satisfied (and with null when it expires or fails). Change
 * `resetKey` after each submit: a token works once.
 */
export function Turnstile({
  siteKey,
  action,
  onToken,
  resetKey,
}: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
  resetKey: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  });

  useEffect(() => {
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return;
        widget.current = ts.render(box.current, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          theme: 'light',
          size: 'flexible',
          callback: (token: string) => report.current(token),
          'expired-callback': () => report.current(null),
          'error-callback': () => report.current(null),
        });
      })
      .catch(() => report.current(null));
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      report.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={box} />;
}
