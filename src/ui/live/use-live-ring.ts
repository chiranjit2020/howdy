'use client';

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type LiveRing = 'off' | 'connecting' | 'live';

type Listener = () => void;

/**
 * One doorbell connection for the whole signed-in tab (ADR-035), shared by every page and window that wants to hear it:
 * the menu's counts, the Messages list, an open chat. Without a provider, a page opens its own connection as before.
 */
interface Bell {
  state: LiveRing;
  listen: (fn: Listener) => () => void;
}
const BellContext = createContext<Bell | null>(null);

/**
 * Open one connection to my own Ably channel and tell every listener when it rings. The ring says only "something new":
 * what is new is always fetched from Howdy's own API. Ably's library is loaded only when a channel is given (instant
 * updates set up). Any failure just leaves pages checking by themselves, as they would without Ably.
 */
function useBellConnection(channel: string | undefined): Bell {
  const [state, setState] = useState<LiveRing>(channel ? 'connecting' : 'off');
  const listeners = useRef(new Set<Listener>());
  const [listen] = useState(() => (fn: Listener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  });

  useEffect(() => {
    if (!channel) return;
    const ringAll = () => listeners.current.forEach((fn) => fn());
    let closed = false;
    let close: (() => void) | undefined;
    void (async () => {
      try {
        const Ably = await import('ably');
        if (closed) return;
        const client = new Ably.Realtime({
          authCallback: (_params, done) => {
            fetch('/api/live/token', { credentials: 'same-origin', headers: { accept: 'application/json' } })
              .then(async (res) =>
                res.ok ? done(null, await res.json()) : done(`token ${res.status}`, null),
              )
              .catch((err: unknown) => done(String(err), null));
          },
          closeOnUnload: true,
        });
        close = () => client.close();
        let connectedBefore = false;
        client.connection.on((change) => {
          if (closed) return;
          setState(change.current === 'connected' ? 'live' : 'connecting');
          if (change.current !== 'connected') return;
          // Back after a gap (sleep, lost signal): a ring may have been missed, so ask once.
          if (connectedBefore) ringAll();
          connectedBefore = true;
        });
        await client.channels.get(channel).subscribe(ringAll);
      } catch {
        if (!closed) setState('off');
      }
    })();
    return () => {
      closed = true;
      close?.();
    };
  }, [channel]);

  return { state: channel ? state : 'off', listen };
}

/** Holds the tab's one doorbell connection. Put once around the signed-in shell. */
export function LiveProvider({ channel, children }: { channel: string | undefined; children: ReactNode }) {
  const bell = useBellConnection(channel);
  return createElement(BellContext.Provider, { value: bell }, children);
}

/**
 * Call `onRing` each time my doorbell rings. Uses the shell's shared connection when there is one; otherwise opens its
 * own for `channel`. Returns whether the bell is connected, so a page can stop checking so often.
 */
export function useLiveRing(channel: string | undefined, onRing: () => void): LiveRing {
  const shared = useContext(BellContext);
  const own = useBellConnection(shared ? undefined : channel);
  const { state, listen } = shared ?? own;
  const ring = useRef(onRing);
  useEffect(() => {
    ring.current = onRing;
  }, [onRing]);
  useEffect(() => listen(() => ring.current()), [listen]);
  return state;
}
