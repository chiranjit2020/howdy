/**
 * Small MP4 files built box by box, for tests of the server's video checks (ADR-064). The server reads only the header
 * (the `moov` index), so these carry a real header and filler bytes where the picture would be.
 */

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

const mvhd = (seconds: number) =>
  box('mvhd', u32(0), u32(0), u32(0), u32(1000), u32(Math.round(seconds * 1000)), Buffer.alloc(80));
const tkhd = (w: number, h: number) => box('tkhd', Buffer.alloc(76), u32(w * 65536), u32(h * 65536));
const hdlr = (kind: string) => box('hdlr', u32(0), u32(0), Buffer.from(kind, 'latin1'), Buffer.alloc(12));
const stsd = (codec: string) => box('stsd', u32(0), u32(1), box(codec, Buffer.alloc(16)));
const trak = (kind: 'vide' | 'soun', codec: string, w = 0, h = 0) =>
  box('trak', tkhd(w, h), box('mdia', hdlr(kind), box('minf', box('stbl', stsd(codec)))));

export interface FakeMp4 {
  seconds?: number;
  width?: number;
  height?: number;
  /** The picture codec: 'avc1' is H.264 (accepted), 'hvc1' is HEVC (refused). */
  codec?: string;
  /** false puts the index after the data (refused: would not start until fully downloaded). */
  fastStart?: boolean;
  /** Filler bytes standing in for the picture. */
  dataBytes?: number;
}

export function fakeMp4(o: FakeMp4 = {}): Buffer {
  const ftyp = box('ftyp', Buffer.from('isom', 'latin1'), u32(512), Buffer.from('isomavc1', 'latin1'));
  const moov = box(
    'moov',
    mvhd(o.seconds ?? 12),
    trak('vide', o.codec ?? 'avc1', o.width ?? 1280, o.height ?? 720),
    trak('soun', 'mp4a'),
  );
  const mdat = box('mdat', Buffer.alloc(o.dataBytes ?? 4096, 7));
  return o.fastStart === false ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}
