import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Redis } from 'ioredis';
import { optionalSession } from '@/modules/auth';
import { getThread, markThreadRead, messageForDelivery, sendWhisper } from '@/modules/whispers';
import { AppError, toPublicError } from '@/platform/errors';
import { clientIp } from '@/platform/http/client-ip';
import { logger } from '@/platform/logger';
import { parseHint, userChannel } from '@/platform/realtime';
import { createRedisClient } from '@/platform/redis';
import {
  CLOSE,
  MAX_FRAME_BYTES,
  clientFrameSchema,
  type ClientFrame,
  type WsFrame,
  type WsOp,
} from '@/shared/ws';

export interface RealtimeOptions {
  /** 0 = pick a free port (tests). */
  port: number;
  /** The site's own origin. A browser connecting from any other origin is refused (cross-site WebSocket hijacking). */
  appUrl: string;
  /** Redis for pub/sub. Without it the server still works for the connected person's own actions, but nothing fans out. */
  redisUrl?: string | undefined;
  trustProxyHops?: number;
  maxConnectionsPerUser?: number;
  maxConnectionsPerIp?: number;
  /** How often a live connection re-checks that its session is still valid. */
  revalidateMs?: number;
  heartbeatMs?: number;
  /** Frames per second a connection may send once its burst is used up. */
  framesPerSecond?: number;
  burst?: number;
}

interface Conn {
  ws: WebSocket;
  userId: string;
  ip: string;
  headers: Headers;
  seq: number;
  tokens: number;
  refilledAt: number;
  violations: number;
  alive: boolean;
  queue: Promise<void>;
  queued: number;
  timers: NodeJS.Timeout[];
}

const CHANNEL_PREFIX = userChannel('');

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) for (const item of v) headers.append(k, item);
    else if (v !== undefined) headers.set(k, v);
  }
  return headers;
}

/**
 * The realtime process (a second entry point sharing the same module code — ARCHITECTURE §1). It does nothing the HTTP API cannot
 * do: every action calls the same `whispers` functions, so the same authorisation, validation and limits apply. What it adds is
 * a long-lived connection, so it also makes sure that lives up to its promises:
 *  - only pages of this site may connect (Origin check) and only signed-in people (session cookie);
 *  - a connection is closed when its session ends, and every delivery is re-authorised (a block stops it at once);
 *  - frames are size-limited, validated against one schema, rate limited and answered in order;
 *  - connections per person and per address are capped, and dead peers are dropped.
 */
export function createRealtimeServer(options: RealtimeOptions) {
  const o = {
    trustProxyHops: 0,
    maxConnectionsPerUser: 5,
    maxConnectionsPerIp: 20,
    revalidateMs: 60_000,
    heartbeatMs: 30_000,
    framesPerSecond: 5,
    burst: 10,
    ...options,
  };
  const appOrigin = new URL(o.appUrl).origin;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  const byUser = new Map<string, Set<Conn>>();
  const perIp = new Map<string, number>();
  let sub: Redis | undefined;

  const server: Server = createServer((req, res) => {
    res.statusCode = req.url === '/health' ? 200 : 404;
    res.end(req.url === '/health' ? 'ok' : '');
  });

  // ─── sending ───────────────────────────────────────────────────────────────────────────────────────────────────────
  function send(conn: Conn, op: WsOp, type: string, requestId: string, d: unknown): void {
    if (conn.ws.readyState !== WebSocket.OPEN) return;
    // A peer that cannot keep up must not make the server buffer without limit.
    if (conn.ws.bufferedAmount > 1_000_000) {
      conn.ws.terminate();
      return;
    }
    const frame: WsFrame = { v: 1, op, type, requestId, seq: ++conn.seq, serverTime: Date.now(), d };
    conn.ws.send(JSON.stringify(frame));
  }
  const err = (
    conn: Conn,
    type: string,
    requestId: string,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) => send(conn, 'ERR', type, requestId, { code, message, ...(fields ? { fields } : {}) });

  // ─── redis fan-out ─────────────────────────────────────────────────────────────────────────────────────────────────
  async function deliver(userId: string, raw: string): Promise<void> {
    const hint = parseHint(raw);
    const conns = byUser.get(userId);
    if (!hint || !conns || conns.size === 0) return;
    // Re-authorised for EVERY delivery: someone blocked (or removed from the Posse) since their socket opened gets nothing.
    const found = await messageForDelivery(userId, hint.conversationId, hint.seq);
    if (!found) return;
    for (const conn of conns) send(conn, 'EVENT', 'whisper.message', 'server', found);
  }

  if (o.redisUrl) {
    sub = createRedisClient(o.redisUrl);
    sub.on('message', (channel: string, raw: string) => {
      if (!channel.startsWith(CHANNEL_PREFIX)) return;
      deliver(channel.slice(CHANNEL_PREFIX.length), raw).catch((e: unknown) =>
        logger.error({ event: 'realtime.deliver_failed', err: e }),
      );
    });
  }

  // ─── one connection ────────────────────────────────────────────────────────────────────────────────────────────────
  function register(conn: Conn): void {
    let set = byUser.get(conn.userId);
    if (!set) {
      set = new Set();
      byUser.set(conn.userId, set);
      sub?.subscribe(userChannel(conn.userId)).catch(() => undefined);
    }
    set.add(conn);
  }

  function unregister(conn: Conn): void {
    for (const t of conn.timers) clearInterval(t);
    const set = byUser.get(conn.userId);
    set?.delete(conn);
    if (set && set.size === 0) {
      byUser.delete(conn.userId);
      sub?.unsubscribe(userChannel(conn.userId)).catch(() => undefined);
    }
    const n = (perIp.get(conn.ip) ?? 1) - 1;
    if (n <= 0) perIp.delete(conn.ip);
    else perIp.set(conn.ip, n);
  }

  function allowFrame(conn: Conn): boolean {
    const now = Date.now();
    conn.tokens = Math.min(o.burst, conn.tokens + ((now - conn.refilledAt) / 1000) * o.framesPerSecond);
    conn.refilledAt = now;
    if (conn.tokens < 1) return false;
    conn.tokens -= 1;
    return true;
  }

  async function run(conn: Conn, frame: ClientFrame): Promise<void> {
    const { type, requestId } = frame;
    try {
      switch (frame.type) {
        case 'ping':
          send(conn, 'ACK', 'ping', requestId, {});
          return;
        case 'whisper.send': {
          const sent = await sendWhisper(conn.userId, frame.d.handle, frame.d.clientId, frame.d.body);
          send(conn, 'ACK', type, requestId, sent);
          return;
        }
        case 'whisper.sync': {
          const page = await getThread(conn.userId, frame.d.handle, { after: frame.d.afterSeq });
          if (!page) throw new AppError('NOT_FOUND');
          send(conn, 'ACK', type, requestId, { messages: page.messages, hasMore: page.hasMore });
          return;
        }
        case 'whisper.read': {
          send(conn, 'ACK', type, requestId, await markThreadRead(conn.userId, frame.d.handle, frame.d.upTo));
          return;
        }
      }
    } catch (e) {
      const { body } = toPublicError(e, requestId);
      if (!(e instanceof AppError)) logger.error({ event: 'realtime.action_failed', type, err: e });
      send(conn, 'ERR', type, requestId, body.error);
    }
  }

  function onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    if (!allowFrame(conn)) {
      err(conn, 'error', 'server', 'RATE_LIMITED', 'Slow down a little.');
      if (++conn.violations >= 5) conn.ws.close(CLOSE.ABUSE, 'too many frames');
      return;
    }
    if (isBinary) {
      err(conn, 'error', 'server', 'BAD_REQUEST', 'Only text frames are accepted.');
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(data.toString('utf8'));
    } catch {
      err(conn, 'error', 'server', 'BAD_REQUEST', 'That request was not understood.');
      return;
    }
    const echo = (json as { requestId?: unknown } | null)?.requestId;
    const rid = typeof echo === 'string' && /^[\w.:-]{1,64}$/.test(echo) ? echo : 'server';
    const parsed = clientFrameSchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.filter((p) => p !== 'd').join('.');
        if (key) fields[key] ??= issue.message;
      }
      err(conn, 'error', rid, 'VALIDATION_FAILED', 'That request was not understood.', fields);
      return;
    }
    // Answered in the order sent (two quick Whispers keep their order), and never an unbounded backlog.
    if (conn.queued >= 20) {
      err(conn, parsed.data.type, parsed.data.requestId, 'RATE_LIMITED', 'Slow down a little.');
      return;
    }
    conn.queued++;
    conn.queue = conn.queue
      .then(() => run(conn, parsed.data))
      .finally(() => {
        conn.queued--;
      });
  }

  function onConnection(ws: WebSocket, userId: string, headers: Headers, ip: string): void {
    const conn: Conn = {
      ws,
      userId,
      ip,
      headers,
      seq: 0,
      tokens: o.burst,
      refilledAt: Date.now(),
      violations: 0,
      alive: true,
      queue: Promise.resolve(),
      queued: 0,
      timers: [],
    };
    register(conn);
    ws.on('message', (data, isBinary) => onMessage(conn, data, isBinary));
    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('error', () => undefined);
    ws.on('close', () => unregister(conn));

    conn.timers.push(
      setInterval(() => {
        // Dead peers (a phone that lost signal) never say goodbye: drop them if they miss a heartbeat.
        if (!conn.alive) {
          ws.terminate();
          return;
        }
        conn.alive = false;
        ws.ping();
      }, o.heartbeatMs),
      setInterval(() => {
        // The session may have ended (logout, "log out everywhere", suspended account): end the connection with it.
        optionalSession(new Request(o.appUrl, { headers: conn.headers }))
          .then((session) => {
            if (!session || session.user.id !== userId) ws.close(CLOSE.SESSION_ENDED, 'session ended');
          })
          .catch(() => undefined); // a passing hiccup does not end the connection
      }, o.revalidateMs),
    );
    send(conn, 'EVENT', 'ready', 'server', {});
  }

  // ─── the upgrade: every check happens before a socket exists ────────────────────────────────────────────────────────
  async function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reject = (code: number, text: string) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      socket.destroy();
    };
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return reject(404, 'Not Found');
    if (req.headers.origin !== appOrigin) return reject(403, 'Forbidden');
    const headers = toHeaders(req.headers);
    const ip = clientIp(headers, o.trustProxyHops);
    if ((perIp.get(ip) ?? 0) >= o.maxConnectionsPerIp) return reject(429, 'Too Many Requests');
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1); // reserved now, so a burst of upgrades cannot all slip past the cap
    const release = () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
    };
    try {
      const session = await optionalSession(new Request(o.appUrl, { headers }));
      if (!session) {
        release();
        return reject(401, 'Unauthorized');
      }
      if ((byUser.get(session.user.id)?.size ?? 0) >= o.maxConnectionsPerUser) {
        release();
        return reject(429, 'Too Many Requests');
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        // The reservation made above becomes this connection's; unregister() gives it back on close.
        onConnection(ws, session.user.id, headers, ip);
      });
    } catch (e) {
      release();
      logger.error({ event: 'realtime.upgrade_failed', err: e });
      reject(503, 'Service Unavailable');
    }
  }
  server.on('upgrade', (req, socket, head) => {
    void onUpgrade(req, socket, head);
  });

  return {
    /** Start listening; resolves with the port actually used. */
    listen(): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(o.port, () => {
          const addr = server.address();
          resolve(typeof addr === 'object' && addr ? addr.port : o.port);
        });
      });
    },
    async close(): Promise<void> {
      for (const set of byUser.values()) for (const c of set) c.ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (sub) {
        sub.disconnect();
        sub = undefined;
      }
    },
    /** Connection counts (for health checks and tests). */
    stats: () => ({
      users: byUser.size,
      connections: [...byUser.values()].reduce((n, s) => n + s.size, 0),
    }),
  };
}

export type RealtimeServer = ReturnType<typeof createRealtimeServer>;
