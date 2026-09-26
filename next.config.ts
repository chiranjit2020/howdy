import type { NextConfig } from 'next';

// CSP (with per-request nonce) is set in src/proxy.ts. Static headers live here.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native or heavy server-only libraries are loaded from node_modules at runtime, never bundled (sharp is native code).
  serverExternalPackages: [
    'pg',
    'pino',
    '@node-rs/argon2',
    'ioredis',
    'sharp',
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
  ],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // "Posse" became "Pals" and "Ranch" became "Porch": old links and bookmarks keep working. Temporary (307) so browsers
  // do not cache them forever.
  async redirects() {
    return [
      { source: '/posse', destination: '/pals', permanent: false },
      { source: '/ranch/:handle', destination: '/porch/:handle', permanent: false },
    ];
  },
};

export default nextConfig;
