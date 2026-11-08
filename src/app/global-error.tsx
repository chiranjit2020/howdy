'use client';

import { Google_Sans } from 'next/font/google';
import { PiWarning } from 'react-icons/pi';
import { StatusPage } from '@/ui/howdy/status-page';
import { Button, buttonClasses } from '@/ui/primitives';
import './globals.css';

const googleSans = Google_Sans({ subsets: ['latin'], variable: '--font-google-sans', display: 'swap' });

/**
 * The last resort: the root layout itself failed, so this replaces the whole document (its own <html> and <body>, its
 * own copy of the styles and font). "Go to Home" is a plain link, a full page load, in case the app's own navigation is
 * what broke. Only the digest is shown, never the error itself.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" data-theme="daylight" className={googleSans.variable}>
      <body>
        <title>Something went wrong · Howdy</title>
        <StatusPage
          Icon={PiWarning}
          title="Something went wrong"
          reference={error.digest}
          actions={
            <>
              <Button onClick={() => retry()}>Try again</Button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose (see above) */}
              <a href="/" className={buttonClasses({ variant: 'link' })}>
                Go to Home
              </a>
            </>
          }
        >
          <p>Howdy didn’t load. It’s on our side, not yours. Try again in a moment.</p>
        </StatusPage>
      </body>
    </html>
  );
}
