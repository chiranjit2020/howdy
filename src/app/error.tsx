'use client';

import Link from 'next/link';
import { GoAlert } from 'react-icons/go';
import { StatusPage } from '@/ui/howdy/status-page';
import { Button, buttonClasses } from '@/ui/primitives';

/**
 * Something broke while showing a page outside the signed-in shell (profile, settings, welcome, the legal pages, sign
 * in). The page of its own, framed like sign-in. In production `error.message` is a generic line for server errors, and
 * it is never shown anyway: only the digest, which matches the server's log entry.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <>
      <title>Something went wrong · Howdy</title>
      <StatusPage
        Icon={GoAlert}
        title="Something went wrong"
        reference={error.digest}
        actions={
          <>
            <Button onClick={() => retry()}>Try again</Button>
            <Link href="/" className={buttonClasses({ variant: 'link' })}>
              Go to Home
            </Link>
          </>
        }
      >
        <p>This page didn’t load. It’s on our side, not yours. Try again in a moment.</p>
      </StatusPage>
    </>
  );
}
