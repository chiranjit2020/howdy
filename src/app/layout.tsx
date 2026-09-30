import type { Metadata, Viewport } from 'next';
import { Fraunces, Google_Sans, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/ui/primitives';
import { parseTheme, THEME_COOKIE } from '@/ui/theme';
import './globals.css';

const googleSans = Google_Sans({ subsets: ['latin'], variable: '--font-google-sans', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', display: 'swap' });
export const metadata: Metadata = {
  title: { default: 'Howdy', template: '%s · Howdy' },
  description: 'A small-circle social world.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f5ee' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1b2e' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theme is read on the server so the first paint is already correct — no inline script (CSP-safe).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${googleSans.variable} ${jetbrains.variable} ${fraunces.variable}`}
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-pill focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
