import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

export interface Frame {
  v: number;
  op: 'ACTION' | 'EVENT' | 'ACK' | 'ERR';
  type: string;
  requestId: string;
  seq: number;
  serverTime: number;
  d: Record<string, unknown> & {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    messages?: unknown[];
    hasMore?: boolean;
  };
}

/** A tiny browser-like client for the realtime server: buffers every frame so a test can wait for exactly the one it wants. */
export class WsClient {
  readonly frames: Frame[] = [];
  closed: { code: number } | undefined;
  private waiters: Array<() => void> = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.frames.push(JSON.parse(data.toString('utf8')) as Frame);
      this.wake();
    });
    ws.on('close', (code) => {
      this.closed = { code };
      this.wake();
    });
    ws.on('error', () => undefined);
  }

  private wake() {
    for (const w of this.waiters.splice(0)) w();
  }

  /** Connect. Resolves once the server's "ready" frame has arrived; rejects with the HTTP status if the upgrade is refused. */
  static open(
    port: number,
    opts: { cookie?: string; origin?: string | null; path?: string } = {},
  ): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (opts.origin !== null) headers.origin = opts.origin ?? 'http://localhost:3000';
      if (opts.cookie) headers.cookie = opts.cookie;
      const ws = new WebSocket(`ws://127.0.0.1:${port}${opts.path ?? '/ws'}`, { headers });
      const client = new WsClient(ws);
      ws.once('unexpected-response', (_req, res) => {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
      });
      ws.once('error', (e) => reject(e));
      ws.once('open', () => {
        client.next((f) => f.type === 'ready').then(() => resolve(client), reject);
      });
    });
  }

  /** Wait for a frame matching `pred` (already-received frames count, once). */
  async next(pred: (f: Frame) => boolean, timeoutMs = 4000): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.frames.findIndex(pred);
      if (i >= 0) return this.frames.splice(i, 1)[0]!;
      if (this.closed) throw new Error(`socket closed (${this.closed.code}) while waiting`);
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('timed out waiting for a frame');
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  /** True if NO frame matching `pred` shows up within `ms` (used for "nothing is delivered"). */
  async never(pred: (f: Frame) => boolean, ms = 600): Promise<boolean> {
    try {
      await this.next(pred, ms);
      return false;
    } catch {
      return true;
    }
  }

  sendRaw(data: string | Buffer, binary = false) {
    this.ws.send(data, { binary });
  }

  /** Send an ACTION and wait for its ACK or ERR (matched by requestId). */
  async request(type: string, d: unknown, requestId: string = randomUUID()): Promise<Frame> {
    this.sendRaw(JSON.stringify({ v: 1, op: 'ACTION', type, requestId, d }));
    return this.next((f) => f.requestId === requestId && (f.op === 'ACK' || f.op === 'ERR'));
  }

  async waitClosed(timeoutMs = 4000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed) {
      if (Date.now() > deadline) throw new Error('socket did not close');
      await new Promise((r) => setTimeout(r, 20));
    }
    return this.closed.code;
  }

  close() {
    this.ws.terminate();
  }
}
