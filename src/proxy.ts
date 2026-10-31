import { NextResponse, type NextRequest } from 'next/server';
import { uploadOrigin } from './platform/storage/origin';

/**
 * Build the CSP header. Exported for tests. `wsOrigin` is the one WebSocket origin pages may connect to (WS_PUBLIC_URL) and
 * `storageOrigin` the one bucket origin they may upload photos to; `live` adds Ably's own hosts (ADR-035, only when a key is
 * set). Nothing else is allowed, so injected script could not open a socket to, or send data to, an attacker's server.
 */
export const ABLY_ORIGINS =
  'https://*.ably.net wss://*.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com';

/** Cloudflare Turnstile, the sign-up bot check: its script and the frame it draws the challenge in. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** sha256 of `display:none`: the one style attribute React's streamed HTML writes (see buildCsp). */
export const STREAMED_SVG_STYLE_HASH = 'sha256-aqNNdDLnnrDOnTNdkJpYlAxKVJtLt9CtFLklmInuUAE=';

export function buildCsp(
  nonce: string,
  isDev: boolean,
  wsOrigin?: string,
  storageOrigin?: string,
  live = false,
  turnstile = false,
): string {
  const extra = [wsOrigin, storageOrigin, live ? ABLY_ORIGINS : undefined].filter(Boolean).join(' ');
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load their own chunks; dev needs eval for React refresh. Turnstile's host is
    // named for older browsers only: ones that understand 'strict-dynamic' ignore host names (our own code loads it).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstile ? ` ${TURNSTILE_ORIGIN}` : ''}${isDev ? " 'unsafe-eval'" : ''}`,
    // Dev injects inline <style> for HMR.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    // One style attribute, exactly: React's streaming wraps late SVG content in <svg style="display:none" id="S:…"> (a
    // nonce cannot cover attributes). The hash is of `display:none` alone; every other style="" stays blocked.
    ...(isDev ? [] : [`style-src-attr 'unsafe-hashes' '${STREAMED_SVG_STYLE_HASH}'`]),
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The service worker (/sw.js). Named explicitly: under 'strict-dynamic' script-src ignores 'self'.
    "worker-src 'self'",
    "manifest-src 'self'",
    isDev
      ? `connect-src 'self' ws: wss:${storageOrigin ? ` ${storageOrigin}` : ''}${live ? ` ${ABLY_ORIGINS}` : ''}`
      : `connect-src 'self'${extra ? ` ${extra}` : ''}`,
    "object-src 'none'",
    // The only page that may be framed IN Howdy is Turnstile's challenge (and only when it is set up).
    ...(turnstile ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(
    nonce,
    process.env.NODE_ENV === 'development',
    process.env.WS_PUBLIC_URL,
    uploadOrigin(process.env.STORAGE_DRIVER, process.env.R2_ACCOUNT_ID),
    Boolean(process.env.ABLY_API_KEY),
    Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY),
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // Never trust a client-supplied request id at the edge; route handlers validate the format and mint their own.
  requestHeaders.set('x-request-id', crypto.randomUUID());

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
