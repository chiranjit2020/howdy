import { z } from 'zod';
import { clientIdSchema, seqSchema, whisperBodySchema } from './validation/whispers';
import { handleParamSchema } from './validation/profile';
import './validation/zod-setup'; // jitless Zod (no eval probe under our CSP)

/**
 * The WebSocket contract (master prompt §29). One versioned envelope in both directions.
 *
 * - The browser sends ACTION frames (`v`, `op`, `type`, `requestId`, `d`).
 * - The server answers each with an ACK or an ERR carrying the same `requestId`, and pushes EVENT frames on its own.
 * - Every server frame carries `seq` (1, 2, 3… per connection, so a client can spot a gap) and `serverTime`.
 * - `seq` inside a message is a different thing: the message's place in its thread (used to catch up after a reconnect).
 */
export const WS_VERSION = 1;
export type WsOp = 'ACTION' | 'EVENT' | 'ACK' | 'ERR';

export interface WsFrame<T = unknown> {
  v: 1;
  op: WsOp;
  type: string;
  requestId: string;
  seq: number;
  serverTime: number;
  d: T;
}

/** What a Whisper looks like on the wire. Never includes ids of people. */
export interface WhisperMessage {
  id: string;
  seq: number;
  /** The sender's device-chosen id (lets the sender match its optimistic copy). */
  clientId: string;
  body: string;
  /** True when I sent it. */
  mine: boolean;
  createdAt: string;
}

const requestId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\w.:-]+$/);
const handle = handleParamSchema;

/** Everything a browser may send. Anything else — unknown type, extra nesting, wrong version — is refused. */
export const clientFrameSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(1),
    op: z.literal('ACTION'),
    type: z.literal('whisper.send'),
    requestId,
    d: z.object({ handle, clientId: clientIdSchema, body: whisperBodySchema }),
  }),
  z.object({
    v: z.literal(1),
    op: z.literal('ACTION'),
    type: z.literal('whisper.sync'),
    requestId,
    d: z.object({ handle, afterSeq: seqSchema }),
  }),
  z.object({
    v: z.literal(1),
    op: z.literal('ACTION'),
    type: z.literal('whisper.read'),
    requestId,
    d: z.object({ handle, upTo: seqSchema }),
  }),
  z.object({ v: z.literal(1), op: z.literal('ACTION'), type: z.literal('ping'), requestId, d: z.object({}) }),
]);
export type ClientFrame = z.infer<typeof clientFrameSchema>;

/** Largest frame the server will read. A Whisper is at most 280 characters; this leaves room for the envelope and escapes. */
export const MAX_FRAME_BYTES = 4096;

/** Close codes the server uses (4000–4999 are application codes). */
export const CLOSE = {
  UNAUTHENTICATED: 4401,
  FORBIDDEN_ORIGIN: 4403,
  SESSION_ENDED: 4408,
  TOO_MANY_CONNECTIONS: 4429,
  ABUSE: 4400,
} as const;
