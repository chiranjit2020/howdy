import { createHash, createSign, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';

/**
 * A software passkey (ADR-040 tests): makes registration and sign-in answers byte-for-byte the way a phone's platform
 * authenticator does — CBOR attestation object ("none"), authenticator data, an ES256 signature over
 * authData ‖ SHA-256(clientDataJSON) — so the server's real WebAuthn checks run against it. Every knob a test needs to
 * break one of those checks is an option.
 */

// ─── a minimal CBOR encoder (ints, byte/text strings, maps) ─────────────────────────────────────────────────────────

function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  const b = Buffer.alloc(5);
  b[0] = (major << 5) | 26;
  b.writeUInt32BE(n, 1);
  return b;
}

type Cbor = number | string | Uint8Array | Map<number | string, Cbor>;

export function cbor(v: Cbor): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') {
    const s = Buffer.from(v, 'utf8');
    return Buffer.concat([head(3, s.length), s]);
  }
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  const parts = [head(5, v.size)];
  for (const [k, val] of v) parts.push(cbor(k), cbor(val));
  return Buffer.concat(parts);
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();

const FLAG = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 } as const;

export interface Ceremony {
  /** Defaults to the test APP_URL's origin. */
  origin?: string;
  rpId?: string;
  /** User verification (fingerprint / screen lock). Defaults to true. */
  uv?: boolean;
  /** Overrides the challenge the authenticator signs. */
  challenge?: string;
  type?: string;
  /** Overrides the signature counter sent. */
  counter?: number;
}

export class SoftPasskey {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly synced: boolean;
  counter: number;
  userHandle: string | undefined;

  constructor(opts: { counter?: number; synced?: boolean } = {}) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    // A synced passkey (password manager) always reports counter 0; a device-bound key counts up.
    this.counter = opts.counter ?? 0;
    this.synced = opts.synced ?? true;
  }

  get id(): string {
    return b64u(this.credentialId);
  }

  private coseKey(): Buffer {
    const jwk = this.publicKey.export({ format: 'jwk' });
    return cbor(
      new Map<number, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
  }

  private authData(rpId: string, flags: number, counter: number, attested: boolean): Buffer {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter);
    const parts: Buffer[] = [sha256(rpId), Buffer.from([flags]), c];
    if (attested) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, this.coseKey());
    }
    return Buffer.concat(parts);
  }

  private flags(o: Ceremony, attested: boolean): number {
    let f = FLAG.UP;
    if (o.uv ?? true) f |= FLAG.UV;
    if (this.synced) f |= FLAG.BE | FLAG.BS;
    if (attested) f |= FLAG.AT;
    return f;
  }

  /** Answer `navigator.credentials.create()` for these options. */
  register(options: { challenge: string; rp: { id?: string }; user: { id: string } }, o: Ceremony = {}) {
    const rpId = o.rpId ?? options.rp.id ?? 'localhost';
    this.userHandle = options.user.id;
    const clientData = Buffer.from(
      JSON.stringify({
        type: o.type ?? 'webauthn.create',
        challenge: o.challenge ?? options.challenge,
        origin: o.origin ?? 'http://localhost:3000',
        crossOrigin: false,
      }),
    );
    const authData = this.authData(rpId, this.flags(o, true), o.counter ?? this.counter, true);
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
      response: {
        clientDataJSON: b64u(clientData),
        attestationObject: b64u(attestationObject),
        transports: ['internal', 'hybrid'],
      },
    };
  }

  /** Answer `navigator.credentials.get()` for these options. A device-bound key's counter moves forward each time. */
  sign(options: { challenge: string; rpId?: string }, o: Ceremony = {}) {
    const rpId = o.rpId ?? options.rpId ?? 'localhost';
    if (!this.synced && o.counter === undefined) this.counter += 1;
    const clientData = Buffer.from(
      JSON.stringify({
        type: o.type ?? 'webauthn.get',
        challenge: o.challenge ?? options.challenge,
        origin: o.origin ?? 'http://localhost:3000',
        crossOrigin: false,
      }),
    );
    const authData = this.authData(rpId, this.flags(o, false), o.counter ?? this.counter, false);
    const signature = createSign('sha256')
      .update(Buffer.concat([authData, sha256(clientData)]))
      .sign(this.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      clientExtensionResults: {},
      authenticatorAttachment: 'platform' as const,
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        ...(this.userHandle ? { userHandle: this.userHandle } : {}),
      },
    };
  }
}
