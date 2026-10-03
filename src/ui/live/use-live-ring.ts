'use client';

import { useEffect, useRef, useState } from 'react';

export type LiveRing = 'off' | 'connecting' | 'live';

/**
 * Listen for the doorbell on my own Ably channel (ADR-035) and call `onRing` each time it rings. The ring says only
 * "something new": what is new is always fetched from Howdy's own API. Ably's library is loaded only on the pages that
 * use this, and only when a channel is given (instant Whispers set up). Any failure just leaves the page checking by
 * itself, as it would without Ably. Returns whether the bell is connected, so the page can stop checking so often.
 */
export function useLiveRing(channel: string | undefined, onRing: () => void): LiveRing {
  const [state, setState] = useState<LiveRing>(channel ? 'connecting' : 'off');
  const ring = useRef(onRing);
  useEffect(() => {
    ring.current = onRing;
  }, [onRing]);

  useEffect(() => {
    if (!channel) return;
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
          if (connectedBefore) ring.current();
          connectedBefore = true;
        });
        await client.channels.get(channel).subscribe(() => ring.current());
      } catch {
        if (!closed) setState('off');
      }
    })();
    return () => {
      closed = true;
      close?.();
    };
  }, [channel]);

  return channel ? state : 'off';
}
