import type { Metadata, Viewport } from 'next';
import { Google_Sans, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/ui/primitives';
import { LaunchScreen } from '@/ui/pwa/launch-screen';
import { parseTheme, THEME_COOKIE } from '@/ui/theme';
import './globals.css';

const googleSans = Google_Sans({ subsets: ['latin'], variable: '--font-google-sans', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });
/** iPhone screens with an opening-screen picture: [CSS width, CSS height, pixel ratio], newest first. */
const IOS_SPLASH = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [414, 896, 3],
  [375, 812, 3],
  [414, 896, 2],
  [375, 667, 2],
] as const;

/**
 * Every page's defaults. `metadataBase` makes share images and page addresses absolute (social apps ignore relative
 * ones); it is read from the environment directly (not getEnv(): `next build` loads this file without the server's
 * environment checks). Pages with a card of their own override `openGraph` and `twitter`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Howdy', template: '%s · Howdy' },
  description: 'Social media for people you actually know.',
  applicationName: 'Howdy',
  openGraph: { siteName: 'Howdy', type: 'website', locale: 'en_IN' },
  twitter: { card: 'summary_large_image' },
  // iPhones: the installed app opens on a picture of the opening screen, one per screen size (public/splash).
  appleWebApp: {
    capable: true,
    title: 'Howdy',
    statusBarStyle: 'default',
    startupImage: IOS_SPLASH.map(([w, h, d]) => ({
      url: `/splash/howdy-${w * d}x${h * d}.png`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)`,
    })),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  // The top bar's blue (2026-11-08), in both themes like the bar itself: the phone's status bar and the browser's
  // toolbar continue it.
  themeColor: '#0187df',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Theme is read on the server so the first paint is already correct — no inline script (CSP-safe).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    // suppressHydrationWarning: extensions (Claude in Chrome, dark-mode tools) add classes to <html> before React loads;
    // like <body> below, only this tag's own attributes are ignored.
    <html
      lang="en"
      data-theme={theme}
      className={`${googleSans.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      {/* Extensions (Grammarly, etc.) add attributes to <body> before React loads; this ignores only <body>'s own
          attributes, so real mismatches inside the page still warn. */}
      <body suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-pill focus:bg-accent-strong focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Skip to content
        </a>
        <LaunchScreen />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
