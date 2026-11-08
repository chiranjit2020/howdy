import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { EntryFooter, EntryLogo } from '../auth/entry-shell';
import { Card } from '../primitives';

/**
 * What a "page not found" / "something went wrong" page says, without the frame around it: an icon in a sunflower
 * circle, the heading (the page's h1), one or two plain sentences and the way out. No hooks, so the error pages (client
 * components) can use it as well as the 404 (a server component).
 */
export function StatusMessage({
  Icon,
  title,
  children,
  actions,
  reference,
}: {
  Icon: IconType;
  title: string;
  children: ReactNode;
  /** The buttons and links: the main way out first. */
  actions: ReactNode;
  /** A code to quote when telling us about it (an error's digest). Shown small, never anything from the error itself. */
  reference?: string | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-text-primary"
      >
        <Icon className="size-7" />
      </span>
      <h1 className="text-heading text-text-primary">{title}</h1>
      <div className="flex max-w-prose flex-col gap-2 text-body text-text-secondary">{children}</div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div>
      {reference && <p className="font-mono text-metadata text-text-muted">Ref: {reference}</p>}
    </div>
  );
}

/**
 * The same message on a page of its own, framed like the sign-in pages (wordmark card, Terms · Privacy · Help under
 * it): for pages outside the signed-in shell, where there is no menu to fall back on. Always Daylight.
 */
export function StatusPage(props: Parameters<typeof StatusMessage>[0]) {
  return (
    <main
      id="main"
      className="daylight-only mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-4"
    >
      <Card className="flex flex-col gap-5 p-5 sm:p-7">
        <EntryLogo />
        <StatusMessage {...props} />
      </Card>
      <EntryFooter />
    </main>
  );
}
