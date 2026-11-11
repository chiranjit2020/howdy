import { describe, expect, it } from 'vitest';
import { inspectMp4, type Mp4Limits } from '@/modules/media/mp4';

const LIMITS: Mp4Limits = { maxSeconds: 30, maxShortSide: 736, maxLongSide: 1312 };

/** One box: 4-byte size, 4-letter type, contents. */
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};

/** mvhd version 0: version/flags, created, modified, timescale, duration, then the rest (zeros). */
const mvhd = (seconds: number, timescale = 1000) =>
  box('mvhd', u32(0), u32(0), u32(0), u32(timescale), u32(Math.round(seconds * timescale)), Buffer.alloc(80));

/** tkhd version 0: 84 bytes of contents, width and height (16.16) at the end. */
const tkhd = (w: number, h: number) => box('tkhd', Buffer.alloc(76), u32(w * 65536), u32(h * 65536));

const hdlr = (kind: string) => box('hdlr', u32(0), u32(0), Buffer.from(kind, 'latin1'), Buffer.alloc(12));

/** stsd: version/flags, one entry, then the entry (a box named by its codec). */
const stsd = (codec: string) => box('stsd', u32(0), u32(1), box(codec, Buffer.alloc(16)));

const trak = (kind: 'vide' | 'soun' | 'text', codec: string, w = 1280, h = 720) =>
  box(
    'trak',
    ...(kind === 'vide' ? [tkhd(w, h)] : [tkhd(0, 0)]),
    box('mdia', hdlr(kind), box('minf', box('stbl', stsd(codec)))),
  );

const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(512), Buffer.from('isomavc1', 'latin1'));
const mdat = box('mdat', Buffer.alloc(64));

function file(...parts: Buffer[]) {
  const buf = Buffer.concat(parts);
  return { buf, size: buf.length };
}

const good = () => file(ftyp, box('moov', mvhd(12.5), trak('vide', 'avc1'), trak('soun', 'mp4a')), mdat);

describe('inspectMp4: what the phone makes is accepted', () => {
  it('reads the length, the size and the sound of a fast-start H.264 + AAC file', () => {
    const { buf, size } = good();
    expect(inspectMp4(buf, size, LIMITS)).toEqual({
      ok: true,
      durationMs: 12500,
      width: 1280,
      height: 720,
      hasAudio: true,
    });
  });

  it('accepts a portrait video and a silent one', () => {
    const { buf, size } = file(ftyp, box('moov', mvhd(8), trak('vide', 'avc1', 720, 1280)), mdat);
    expect(inspectMp4(buf, size, LIMITS)).toMatchObject({
      ok: true,
      width: 720,
      height: 1280,
      hasAudio: false,
    });
  });

  it('accepts a tall 20:9 clip fitted inside 720 × 1280 (576 × 1280)', () => {
    const { buf, size } = file(ftyp, box('moov', mvhd(8), trak('vide', 'avc1', 576, 1280)), mdat);
    expect(inspectMp4(buf, size, LIMITS).ok).toBe(true);
  });

  it('allows half a second over 30 for how encoders round the last frame', () => {
    const { buf, size } = file(ftyp, box('moov', mvhd(30.4), trak('vide', 'avc1')), mdat);
    expect(inspectMp4(buf, size, LIMITS).ok).toBe(true);
  });
});

describe('inspectMp4: anything else is refused, with the reason', () => {
  it('not an MP4 at all', () => {
    const junk = Buffer.from('this is not a video, just some text pretending to be one');
    expect(inspectMp4(junk, junk.length, LIMITS)).toEqual({ ok: false, reason: 'not_mp4' });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(inspectMp4(png, png.length, LIMITS)).toEqual({ ok: false, reason: 'not_mp4' });
  });

  it('the index after the data (would download fully before playing)', () => {
    const { buf, size } = file(ftyp, mdat, box('moov', mvhd(10), trak('vide', 'avc1')));
    expect(inspectMp4(buf, size, LIMITS)).toEqual({ ok: false, reason: 'not_fast_start' });
  });

  it('the index cut off by the bytes read, or claiming more than the file holds', () => {
    const { buf, size } = good();
    const cut = buf.subarray(0, ftyp.length + 40);
    expect(inspectMp4(cut, size, LIMITS)).toEqual({ ok: false, reason: 'not_fast_start' });
    expect(inspectMp4(buf, ftyp.length + 20, LIMITS)).toEqual({ ok: false, reason: 'not_fast_start' });
  });

  it('HEVC (what iPhones record), VP9, or sound that is not AAC', () => {
    for (const [v, a] of [
      ['hvc1', 'mp4a'],
      ['hev1', 'mp4a'],
      ['vp09', 'mp4a'],
      ['avc1', 'Opus'],
    ] as const) {
      const { buf, size } = file(ftyp, box('moov', mvhd(5), trak('vide', v), trak('soun', a)), mdat);
      expect(inspectMp4(buf, size, LIMITS), `${v}+${a}`).toEqual({ ok: false, reason: 'wrong_codec' });
    }
  });

  it('two picture tracks, an extra kind of track, or sound only', () => {
    const cases = [
      [trak('vide', 'avc1'), trak('vide', 'avc1')],
      [trak('vide', 'avc1'), trak('text', 'tx3g')],
      [trak('soun', 'mp4a')],
    ];
    for (const traks of cases) {
      const { buf, size } = file(ftyp, box('moov', mvhd(5), ...traks), mdat);
      expect(inspectMp4(buf, size, LIMITS)).toEqual({ ok: false, reason: 'wrong_codec' });
    }
  });

  it('longer than 30 seconds', () => {
    const { buf, size } = file(ftyp, box('moov', mvhd(31), trak('vide', 'avc1')), mdat);
    expect(inspectMp4(buf, size, LIMITS)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('bigger than 720p (a 1080p or 4K original that skipped the phone step)', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1920],
      [3840, 2160],
    ]) {
      const { buf, size } = file(ftyp, box('moov', mvhd(5), trak('vide', 'avc1', w, h)), mdat);
      expect(inspectMp4(buf, size, LIMITS), `${w}x${h}`).toEqual({
        ok: false,
        reason: 'too_large',
        size: `${w}x${h}`,
      });
    }
  });

  it('a zero or unreadable length', () => {
    const { buf, size } = file(ftyp, box('moov', mvhd(0), trak('vide', 'avc1')), mdat);
    expect(inspectMp4(buf, size, LIMITS)).toEqual({ ok: false, reason: 'not_mp4' });
    const noMvhd = file(ftyp, box('moov', trak('vide', 'avc1')), mdat);
    expect(inspectMp4(noMvhd.buf, noMvhd.size, LIMITS)).toEqual({ ok: false, reason: 'not_mp4' });
  });

  it('never throws on damaged boxes', () => {
    const { buf } = good();
    for (let cut = 0; cut < buf.length; cut += 7) {
      const damaged = Buffer.from(buf);
      damaged.writeUInt32BE(0xfffffff0, Math.min(cut, damaged.length - 4));
      expect(() => inspectMp4(damaged, damaged.length, LIMITS)).not.toThrow();
    }
  });
});
