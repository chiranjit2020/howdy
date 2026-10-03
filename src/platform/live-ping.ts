import { createHmac, randomBytes } from 'node:crypto';
import { getEnv } from './config/env';
import { logger } from './logger';

/**
 * Instant Whispers through Ably (ADR-035), as a doorbell only. After a Whisper is saved, the server rings "something new
 * for you" on the person's own Ably channel; their open Whispers page then asks HOWDY what is new, through the normal
 * API and its checks. The ring carries no words, no names and no ids, and Ably never learns who anyone is: a channel is
 * an unguessable keyed hash of the account id, and the token a browser gets can only listen to its own channel.
 *
 * Plain fetch + the Ably REST/token formats, no server SDK (the same choice as the Resend mailer). Unset ABLY_API_KEY =
 * no rings; pages keep themselves current by asking every few seconds, exactly as before.
 */

const REST = 'https://main.realtime.ably.net';
/** A browser's listening token lives this long; the browser fetches a new one by itself before it runs out. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

interface Key {
  name: string;
  secret: string;
  full: string;
}

function key(): Key | null {
  const full = getEnv().ABLY_API_KEY;
  if (!full) return null;
  const i = full.indexOf(':');
  return { name: full.slice(0, i), secret: full.slice(i + 1), full };
}

export const liveConfigured = (): boolean => key() !== null;

/** The person's channel: a keyed hash, so it says nothing about who they are and cannot be guessed from their id. */
export function liveChannelFor(userId: string): string | undefined {
  const k = key();
  if (!k) return undefined;
  return `u:${createHmac('sha256', k.secret).update(`howdy-live:${userId}`).digest('base64url').slice(0, 32)}`;
}

/** Ring these people's channels. Best-effort: a failure is logged, never thrown (the page's own checking still runs). */
export async function ringLive(userIds: string[]): Promise<void> {
  const k = key();
  if (!k) return;
  const auth = `Basic ${Buffer.from(k.full).toString('base64')}`;
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const channel = liveChannelFor(id)!;
      try {
        const res = await fetch(`${REST}/channels/${encodeURIComponent(channel)}/messages`, {
          method: 'POST',
          headers: { authorization: auth, 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'ring' }),
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) logger.warn({ event: 'live.ring_failed', status: res.status });
      } catch (err) {
        logger.warn({ event: 'live.ring_failed', err });
      }
    }),
  );
}

export interface LiveTokenRequest {
  keyName: string;
  ttl: number;
  capability: string;
  timestamp: number;
  nonce: string;
  mac: string;
}

/**
 * A signed Ably token request that lets ONE browser listen (subscribe only) to its owner's channel and nothing else. The
 * browser trades it with Ably for a token; our key's secret never leaves the server. No clientId: Ably is not told who.
 */
export function liveTokenRequest(userId: string, now = Date.now()): LiveTokenRequest | null {
  const k = key();
  if (!k) return null;
  const capability = JSON.stringify({ [liveChannelFor(userId)!]: ['subscribe'] });
  const nonce = randomBytes(16).toString('hex');
  // No clientId: it is signed as the empty string and left out of the request (Ably refuses an empty one).
  const text = [k.name, TOKEN_TTL_MS, capability, '', now, nonce].join('\n') + '\n';
  const mac = createHmac('sha256', k.secret).update(text).digest('base64');
  return { keyName: k.name, ttl: TOKEN_TTL_MS, capability, timestamp: now, nonce, mac };
}
