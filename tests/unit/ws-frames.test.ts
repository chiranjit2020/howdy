import { describe, expect, it } from 'vitest';
import { clientFrameSchema, MAX_FRAME_BYTES } from '@/shared/ws';
import { hasDisguisingChars } from '@/shared/validation/profile';
import { clientIdSchema, seqQuerySchema, seqSchema, whisperBodySchema } from '@/shared/validation/whispers';

const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
const frame = (type: string, d: unknown, extra: object = {}) => ({
  v: 1,
  op: 'ACTION',
  type,
  requestId: 'r-1',
  d,
  ...extra,
});

describe('client frames', () => {
  it('accepts exactly the four actions, with their data', () => {
    for (const f of [
      frame('ping', {}),
      frame('whisper.send', { handle: 'Alice_1', clientId: id.toUpperCase(), body: '  hi   there ' }),
      frame('whisper.sync', { handle: 'alice_1', afterSeq: 0 }),
      frame('whisper.read', { handle: 'alice_1', upTo: 12 }),
    ]) {
      expect(clientFrameSchema.safeParse(f).success, JSON.stringify(f)).toBe(true);
    }
    const sent = clientFrameSchema.parse(
      frame('whisper.send', { handle: 'Alice_1', clientId: id.toUpperCase(), body: '  hi   there ' }),
    );
    if (sent.type !== 'whisper.send') throw new Error('type');
    expect(sent.d).toEqual({ handle: 'alice_1', clientId: id, body: 'hi there' }); // normalised
  });

  it('refuses everything else', () => {
    const bad: unknown[] = [
      null,
      [],
      'x',
      frame('ping', {}, { v: 2 }),
      frame('ping', {}, { v: '1' }),
      frame('ping', {}, { op: 'EVENT' }),
      frame('ping', {}, { op: 'ACK' }),
      frame('ping', {}, { requestId: '' }),
      frame('ping', {}, { requestId: 'a'.repeat(65) }),
      frame('ping', {}, { requestId: 'a b' }),
      frame('ping', {}, { requestId: 7 }),
      frame('whisper.delete', {}),
      frame('__proto__', {}),
      frame('whisper.send', { handle: 'a', clientId: id, body: 'x' }), // handle too short
      frame('whisper.send', { handle: 'alice_1', clientId: 'nope', body: 'x' }),
      frame('whisper.send', { handle: 'alice_1', clientId: id, body: 'x'.repeat(281) }),
      frame('whisper.send', { handle: 'alice_1', clientId: id, body: 5 }),
      frame('whisper.sync', { handle: 'alice_1', afterSeq: -1 }),
      frame('whisper.sync', { handle: 'alice_1', afterSeq: '3' }),
      frame('whisper.sync', { handle: 'alice_1', afterSeq: 1.5 }),
      frame('whisper.read', { handle: 'alice_1', upTo: null }),
      frame('whisper.read', { handle: 'alice_1' }),
    ];
    for (const f of bad) expect(clientFrameSchema.safeParse(f).success, JSON.stringify(f)).toBe(false);
  });

  it('ignores extra keys instead of obeying them', () => {
    const parsed = clientFrameSchema.parse(
      frame('ping', { userId: 'someone-else' }, { seq: 99, serverTime: 1 }),
    );
    expect(parsed).not.toHaveProperty('seq');
    expect((parsed as { d: object }).d).toEqual({});
  });

  it('a frame limit that fits a full Whisper with room to spare but not a book', () => {
    const biggest = JSON.stringify(
      frame('whisper.send', { handle: 'a'.repeat(24), clientId: id, body: '\u{1F920}'.repeat(280) }),
    );
    expect(Buffer.byteLength(biggest)).toBeLessThan(MAX_FRAME_BYTES);
    expect(MAX_FRAME_BYTES).toBeLessThanOrEqual(8192);
  });
});

describe('Whisper text and numbers', () => {
  it('bodies: 280 fit, disguising characters never', () => {
    expect(whisperBodySchema.safeParse('a'.repeat(280)).success).toBe(true);
    expect(whisperBodySchema.safeParse('a'.repeat(281)).success).toBe(false);
    // (U+FEFF is not listed: JavaScript treats it as whitespace, so it is collapsed to a space before the check.)
    for (const cp of [0x202e, 0x200b, 0x0000, 0x0007, 0x2066, 0x2069]) {
      const s = `a${String.fromCodePoint(cp)}b`;
      expect(hasDisguisingChars(s)).toBe(true);
      expect(whisperBodySchema.safeParse(s).success, cp.toString(16)).toBe(false);
    }
  });

  it('client ids are lower-cased uuids and nothing else', () => {
    expect(clientIdSchema.parse(id.toUpperCase())).toBe(id);
    for (const bad of ['', 'x', id.slice(1), `${id}0`, `${id.slice(0, 35)}g`, "'; --", 5]) {
      expect(clientIdSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });

  it('positions: real integers in a body, digit strings in a query, never null or floats', () => {
    for (const ok of [0, 1, 2_000_000_000]) expect(seqSchema.safeParse(ok).success).toBe(true);
    for (const bad of [-1, 1.5, '1', null, undefined, 2_000_000_001, Number.NaN, Infinity])
      expect(seqSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(seqQuerySchema.parse('42')).toBe(42);
    for (const bad of ['', '-1', '1.5', '1e3', ' 1', '99999999999', 'x', '0x10'])
      expect(seqQuerySchema.safeParse(bad).success, bad).toBe(false);
  });
});
