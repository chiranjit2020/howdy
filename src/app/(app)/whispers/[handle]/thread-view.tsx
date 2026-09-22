'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { LIMITS } from '@/shared/limits';
import type { PortraitTint } from '@/shared/validation/profile';
import type { WhisperMessage } from '@/shared/ws';
import { Art } from '@/ui/art/glyph';
import { apiRequest, postJson } from '@/ui/auth/api';
import { FormMessage } from '@/ui/auth/form-parts';
import { WhisperBubble } from '@/ui/howdy';
import { Avatar, Button, ConfirmationDialog, Textarea } from '@/ui/primitives';

type Msg = WhisperMessage & { state?: 'sending' | 'failed'; error?: string };
type Live = 'live' | 'connecting' | 'offline' | 'ended' | 'off';

interface Frame {
  op: string;
  type: string;
  requestId: string;
  d: { code?: string; message?: unknown; fields?: Record<string, string>; [key: string]: unknown };
}

const POLL_MS = 8000;

const sortMsgs = (list: Msg[]): Msg[] =>
  [...list].sort(
    (a, b) => (a.seq || Infinity) - (b.seq || Infinity) || a.createdAt.localeCompare(b.createdAt),
  );

/**
 * One Whisper thread. It works with or without the live connection: sending always has an HTTP path (with the same
 * client id, so a retry after a dropped connection can never duplicate), and when the socket is down the page keeps itself
 * up to date by asking for what it missed. The server re-checks everything either way.
 */
export function ThreadView({
  handle,
  displayName,
  portraitTint,
  initial,
  wsUrl,
}: {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  initial: { messages: WhisperMessage[]; hasMore: boolean };
  wsUrl: string | undefined;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [live, setLive] = useState<Live>(wsUrl ? 'connecting' : 'off');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [burning, setBurning] = useState(false);
  const [busy, setBusy] = useState<'older' | 'burn' | undefined>();
  // False while rendering on the server and hydrating, true afterwards: times of day are the browser's, not the server's.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const socket = useRef<WebSocket | null>(null);
  const waiting = useRef(new Map<string, (f: Frame) => void>());
  const lastSeq = useRef(initial.messages.reduce((n, m) => Math.max(n, m.seq), 0));
  const readTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  /** Add server messages (from any path) without ever duplicating: matched by id, or by the client id of my own optimistic copy. */
  const merge = useCallback((incoming: WhisperMessage[]) => {
    if (incoming.length === 0) return;
    for (const m of incoming) lastSeq.current = Math.max(lastSeq.current, m.seq);
    setMessages((prev) => {
      const next = prev.filter(
        (p) => !incoming.some((m) => m.id === p.id || (p.state && m.clientId === p.clientId)),
      );
      const kept = next.filter((p) => !incoming.some((m) => m.id === p.id));
      return sortMsgs([...kept, ...incoming]);
    });
  }, []);

  /** Tell the server how far I have read. Private to me; nobody is told. */
  const markRead = useCallback(() => {
    clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (lastSeq.current > 0) void postJson(`/api/whispers/${handle}/read`, { upTo: lastSeq.current });
    }, 400);
  }, [handle]);

  /** Fetch what happened since the last message I have (after a reconnect, or when polling). */
  const catchUp = useCallback(async () => {
    for (let i = 0; i < 5; i++) {
      const res = await apiRequest<{ messages: WhisperMessage[]; hasMore: boolean }>(
        'GET',
        `/api/whispers/${handle}?after=${lastSeq.current}`,
      );
      if (!res.ok || !res.data) return;
      merge(res.data.messages);
      if (res.data.messages.some((m) => !m.mine)) markRead();
      if (!res.data.hasMore) return;
    }
  }, [handle, merge, markRead]);

  // ─── the live connection ───────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wsUrl) return;
    let stopped = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = () => {
      if (stopped) return;
      setLive('connecting');
      const ws = new WebSocket(`${wsUrl}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setLive('live');
        void catchUp(); // anything that arrived while the connection was down
      };
      ws.onmessage = (ev) => {
        let f: Frame;
        try {
          f = JSON.parse(String(ev.data)) as Frame;
        } catch {
          return;
        }
        const pendingReply = waiting.current.get(f.requestId);
        if (pendingReply && (f.op === 'ACK' || f.op === 'ERR')) {
          waiting.current.delete(f.requestId);
          pendingReply(f);
        } else if (f.op === 'EVENT' && f.type === 'whisper.message' && f.d.handle === handle) {
          const message = f.d.message as unknown as WhisperMessage;
          merge([message]);
          if (!message.mine) markRead();
        }
      };
      ws.onclose = (ev) => {
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        if (ev.code === 4408 || ev.code === 4401) {
          setLive('ended'); // the session is over: no point retrying until they sign in again
          return;
        }
        setLive('offline');
        // Mobile networks drop constantly: back off (1s, 2s, 4s … 30s) with a little jitter.
        attempt += 1;
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500);
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket.current?.close();
      socket.current = null;
    };
  }, [wsUrl, handle, merge, markRead, catchUp]);

  // Without a live connection the page still stays current by asking now and then.
  useEffect(() => {
    if (live === 'live' || live === 'connecting' || live === 'ended') return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void catchUp();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [live, catchUp]);

  useEffect(() => {
    markRead();
    return () => clearTimeout(readTimer.current);
  }, [markRead]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // ─── sending ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function request(type: string, d: unknown): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('offline'));
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        waiting.current.delete(requestId);
        reject(new Error('timeout'));
      }, 8000);
      waiting.current.set(requestId, (f) => {
        clearTimeout(timer);
        resolve(f);
      });
      ws.send(JSON.stringify({ v: 1, op: 'ACTION', type, requestId, d }));
    });
  }

  const fail = (clientId: string, error: string) =>
    setMessages((all) => all.map((m) => (m.clientId === clientId ? { ...m, state: 'failed', error } : m)));

  /** Send (or resend) one Whisper. The same client id is used for every attempt, so it can only ever arrive once. */
  async function deliver(clientId: string, body: string) {
    setMessages((all) => all.map((m) => (m.clientId === clientId ? { ...m, state: 'sending' } : m)));
    try {
      const f = await request('whisper.send', { handle, clientId, body });
      if (f.op === 'ACK') return merge([(f.d as unknown as { message: WhisperMessage }).message]);
      return fail(
        clientId,
        f.d.fields?.body ?? (typeof f.d.message === 'string' ? f.d.message : 'That did not send.'),
      );
    } catch {
      /* no live connection, or no answer in time: fall back to HTTP with the SAME client id */
    }
    const res = await postJson<{ message: WhisperMessage }>(`/api/whispers/${handle}`, { clientId, body });
    if (res.ok && res.data) merge([res.data.message]);
    else fail(clientId, res.error?.fields?.body ?? res.error?.message ?? 'That did not send.');
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(undefined);
    const clientId = crypto.randomUUID();
    setText('');
    setMessages((all) =>
      sortMsgs([
        ...all,
        {
          id: clientId,
          seq: 0,
          clientId,
          body,
          mine: true,
          createdAt: new Date().toISOString(),
          state: 'sending',
        },
      ]),
    );
    await deliver(clientId, body);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function older() {
    const first = messages.find((m) => m.seq > 0);
    if (!first) return;
    setBusy('older');
    const res = await apiRequest<{ messages: WhisperMessage[]; hasMore: boolean }>(
      'GET',
      `/api/whispers/${handle}?before=${first.seq}`,
    );
    setBusy(undefined);
    if (res.ok && res.data) {
      const more = res.data.messages;
      setMessages((all) => sortMsgs([...more.filter((m) => !all.some((a) => a.id === m.id)), ...all]));
      setHasMore(res.data.hasMore);
    } else setError(res.error?.message ?? 'Could not load older Whispers.');
  }

  async function burn() {
    setBusy('burn');
    const res = await apiRequest('DELETE', `/api/whispers/${handle}`);
    setBusy(undefined);
    if (res.ok) router.push('/whispers');
    else setError(res.error?.message ?? 'Could not burn the thread.');
    setBurning(false);
  }

  const clock = (iso: string) =>
    mounted ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const lastMine = [...messages].reverse().find((m) => m.mine && !m.state)?.id;
  const status: Record<Live, string> = {
    live: 'Live',
    connecting: 'Connecting…',
    offline: 'Reconnecting… Whispers still send.',
    ended: 'Signed out. Sign in again to keep going.',
    off: 'Whispers arrive within a few seconds.',
  };

  return (
    <>
      <header className="flex flex-wrap items-center gap-3">
        <Avatar name={displayName} tint={portraitTint} />
        <div className="min-w-0 flex-1">
          <h1 className="text-title [overflow-wrap:anywhere] text-text-primary">{displayName}</h1>
          <p className="text-caption text-text-secondary">
            <Link href={`/ranch/${handle}`}>@{handle}</Link>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setBurning(true)}>
          Burn thread
        </Button>
      </header>
      <p role="status" className="text-metadata text-text-secondary">
        {status[live]}
      </p>

      {hasMore && (
        <Button
          variant="secondary"
          size="sm"
          loading={busy === 'older'}
          onClick={older}
          className="self-center"
        >
          Older Whispers
        </Button>
      )}

      <div
        role="log"
        aria-live="polite"
        aria-label={`Whispers with ${displayName}`}
        className="flex min-h-40 flex-col gap-3 rounded-lg bg-surface-sunken p-3"
      >
        {messages.length === 0 && (
          <p className="m-auto py-8 text-center text-caption text-text-secondary">
            Nothing yet. Say howdy. Whispers vanish after 7 days.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-1">
            <WhisperBubble
              direction={m.mine ? 'out' : 'in'}
              body={m.body}
              time={clock(m.createdAt)}
              {...(m.state === 'sending'
                ? { status: 'sending' as const }
                : m.state === 'failed'
                  ? { status: 'failed' as const }
                  : m.id === lastMine
                    ? { status: 'sent' as const }
                    : {})}
            />
            {m.state === 'failed' && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-metadata text-text-secondary">{m.error}</span>
                <Button size="sm" variant="secondary" onClick={() => void deliver(m.clientId, m.body)}>
                  Try again
                </Button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <Textarea
          label={`Whisper to ${displayName}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={LIMITS.WHISPER_MAX}
          showCount
          rows={2}
          placeholder="Just between the two of you…"
        />
        <Button type="submit" disabled={!text.trim()} className="self-end">
          Send <Art name="plane" />
        </Button>
      </form>

      <ConfirmationDialog
        open={burning}
        destructive
        title="Burn this thread?"
        description={`Every Whisper between you and ${displayName} is deleted for both of you, for good. This cannot be undone.`}
        confirmLabel="Burn it"
        loading={busy === 'burn'}
        onCancel={() => setBurning(false)}
        onConfirm={burn}
      />
    </>
  );
}
