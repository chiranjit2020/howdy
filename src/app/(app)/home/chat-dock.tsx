'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ThreadView } from '@/app/(app)/messages/[handle]/thread-view';
import type { PortraitTint } from '@/shared/validation/profile';
import type { WhisperMessage } from '@/shared/ws';
import { apiRequest } from '@/ui/auth/api';

export interface ChatPerson {
  handle: string;
  displayName: string;
  portraitTint?: PortraitTint | undefined;
  portraitUrl?: string | undefined;
}

type Thread = { messages: WhisperMessage[]; hasMore: boolean; seenUpTo?: number };
type State =
  | { status: 'loading'; person: ChatPerson }
  | { status: 'ready'; person: ChatPerson; thread: Thread }
  | { status: 'failed'; person: ChatPerson };

/** The window is for wide screens, where Home has its right panel; narrower ones go to the Messages page. */
const WIDE = '(min-width: 80rem)';

/**
 * How a link asks for the window: a cancelable event on `window`, accepted (preventDefault) by the window when it is
 * there. A link anywhere on the page can ask, and where no window listens (another page) it stays a plain link.
 */
const OPEN_CHAT = 'howdy:open-chat';
type OpenChatDetail = { person: ChatPerson; from: HTMLElement };

/**
 * Home's chat window (bottom right, wide screens): one conversation at a time, opened from the right panel. It is the
 * Messages page's own conversation (`ThreadView`), so sending, live updates, Seen, flagging and burning behave and are
 * checked exactly the same. Leaving Home closes it.
 */
export function ChatDockProvider({
  wsUrl,
  liveChannel,
  children,
}: {
  wsUrl: string | undefined;
  liveChannel: string | undefined;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const windowRef = useRef<HTMLElement>(null);
  const handle = state?.person.handle;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const { person, from } = (e as CustomEvent<OpenChatDetail>).detail;
      e.preventDefault(); // "the window has it": the link does not navigate
      opener.current = from;
      setState({ status: 'loading', person });
    };
    window.addEventListener(OPEN_CHAT, onOpen);
    return () => window.removeEventListener(OPEN_CHAT, onOpen);
  }, []);

  // Load the conversation when one is opened (and only that one: a quick second click wins).
  useEffect(() => {
    if (!handle || state?.status !== 'loading') return;
    let current = true;
    void apiRequest<Thread>('GET', `/api/whispers/${handle}`).then((res) => {
      if (!current) return;
      setState((s) =>
        s?.person.handle !== handle
          ? s
          : res.ok && res.data
            ? { status: 'ready', person: s.person, thread: res.data }
            : { status: 'failed', person: s.person },
      );
    });
    return () => {
      current = false;
    };
  }, [handle, state?.status]);

  // Once it is there, the cursor goes into the box.
  useEffect(() => {
    if (state?.status === 'ready') windowRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, [state?.status, handle]);

  const close = useCallback(() => {
    setState(null);
    opener.current?.focus();
    // Unread counts in the panel and the menu were for before this chat was read.
    router.refresh();
  }, [router]);

  return (
    <>
      {children}
      {state && (
        <section
          ref={windowRef}
          aria-label={`Chat with ${state.person.displayName}`}
          onKeyDown={(e) => {
            // Esc closes the window, unless a menu or dialog inside it is open: that Esc is theirs (they listen on the
            // document, which hears it after us, so the check has to be here).
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            const inLayer = (e.target as HTMLElement).closest('dialog, [role="menu"]');
            if (inLayer || windowRef.current?.querySelector('[aria-expanded="true"]')) return;
            close();
          }}
          className="fixed right-4 bottom-4 z-40 flex h-[30rem] max-h-[calc(100dvh-5rem)] w-[22rem] flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-float"
        >
          {state.status === 'ready' ? (
            <ThreadView
              key={state.person.handle}
              handle={state.person.handle}
              displayName={state.person.displayName}
              portraitTint={state.person.portraitTint ?? 'peach'}
              portraitUrl={state.person.portraitUrl}
              initial={state.thread}
              wsUrl={wsUrl}
              liveChannel={liveChannel}
              dock={{ onClose: close }}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <p role="status" className="text-caption text-text-secondary">
                {state.status === 'loading'
                  ? `Opening your chat with ${state.person.displayName}…`
                  : 'This chat could not be opened just now.'}
              </p>
              {state.status === 'failed' && (
                <Link href={`/messages/${state.person.handle}`} className="text-caption font-semibold">
                  Open it in Messages
                </Link>
              )}
              <button type="button" onClick={close} className="text-caption text-text-secondary underline">
                Close
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

/**
 * A link to a conversation. On a wide screen inside Home it opens the chat window instead; everywhere else (phones,
 * a new tab, no JavaScript) it is an ordinary link to the Messages page.
 */
export function ChatLink({
  person,
  className,
  children,
  ...aria
}: {
  person: ChatPerson;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  title?: string;
}) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!window.matchMedia(WIDE).matches) return;
    const ask = new CustomEvent<OpenChatDetail>(OPEN_CHAT, {
      cancelable: true,
      detail: { person, from: e.currentTarget },
    });
    // dispatchEvent is false when the window took it; otherwise this stays an ordinary link.
    if (!window.dispatchEvent(ask)) e.preventDefault();
  }
  return (
    <Link href={`/messages/${person.handle}`} onClick={onClick} className={className} {...aria}>
      {children}
    </Link>
  );
}
