import { NextResponse, type NextRequest } from 'next/server';
import { uploadOrigin } from './platform/storage/origin';

/**
 * Build the CSP header. Exported for tests. `wsOrigin` is the one WebSocket origin pages may connect to (WS_PUBLIC_URL) and
 * `storageOrigin` the one bucket origin they may upload photos to; `live` adds Ably's own hosts (ADR-035, only when a key is
 * set). Nothing else is allowed, so injected script could not open a socket to, or send data to, an attacker's server.
 */
export const ABLY_ORIGINS =
  'https://*.ably.net wss://*.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com';

export function buildCsp(
  nonce: string,
  isDev: boolean,
  wsOrigin?: string,
  storageOrigin?: string,
  live = false,
): string {
  const extra = [wsOrigin, storageOrigin, live ? ABLY_ORIGINS : undefined].filter(Boolean).join(' ');
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load their own chunks; dev needs eval for React refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Dev injects inline <style> for HMR.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The service worker (/sw.js). Named explicitly: under 'strict-dynamic' script-src ignores 'self'.
    "worker-src 'self'",
    "manifest-src 'self'",
    isDev
      ? `connect-src 'self' ws: wss:${storageOrigin ? ` ${storageOrigin}` : ''}${live ? ` ${ABLY_ORIGINS}` : ''}`
      : `connect-src 'self'${extra ? ` ${extra}` : ''}`,
    "object-src 'none'",
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
