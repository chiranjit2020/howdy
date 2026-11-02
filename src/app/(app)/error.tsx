'use client';

import Link from 'next/link';
import { GoAlert } from 'react-icons/go';
import { PageFrame } from '@/ui/howdy/page-frame';
import { StatusMessage } from '@/ui/howdy/status-page';
import { Button, buttonClasses, Card } from '@/ui/primitives';

/**
 * Something broke inside the signed-in shell (Home, Friends, Messages, Groups…). The menu stays, so only the page area
 * shows this, in Home's frame. Only the digest is shown, never the error itself.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageFrame>
      <title>Something went wrong · Howdy</title>
      <Card className="p-5 sm:p-7">
        <StatusMessage
          Icon={GoAlert}
          title="Something went wrong"
          reference={error.digest}
          actions={
            <>
              <Button onClick={() => retry()}>Try again</Button>
              <Link href="/home" className={buttonClasses({ variant: 'link' })}>
                Go to Home
              </Link>
            </>
          }
        >
          <p>This page didn’t load. It’s on our side, not yours. Try again in a moment.</p>
        </StatusMessage>
      </Card>
    </PageFrame>
  );
}
