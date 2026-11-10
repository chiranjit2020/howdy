/**
 * Read just enough of an MP4's header to decide whether Howdy will serve it (ADR-064). No decoding, no dependencies:
 * an MP4 is a tree of "boxes" (4-byte size, 4-letter type, contents), and the facts we need sit in a few of them:
 *
 *   ftyp                      first box: says "this is an MP4"
 *   moov                      the index; must come BEFORE the video data (`mdat`), which is what "fast start" means
 *     mvhd                    timescale + duration -> the length
 *     trak (one per track)
 *       tkhd                  the picture's width and height
 *       mdia/hdlr             the track's kind: 'vide' (picture) or 'soun' (sound)
 *       mdia/minf/stbl/stsd   the codec: 'avc1'/'avc3' (H.264) for picture, 'mp4a' (AAC) for sound
 *
 * The phone converts every clip to exactly this; anything else was not made by Howdy's page and is refused.
 */

export type Mp4Verdict =
  | { ok: true; durationMs: number; width: number; height: number; hasAudio: boolean }
  | { ok: false; reason: Mp4Problem };

export type Mp4Problem =
  /** Not an MP4 at all, or a damaged one. */
  | 'not_mp4'
  /** The index is after the video data (or not within the bytes read): it would not start playing until fully downloaded. */
  | 'not_fast_start'
  /** Not H.264 picture (+ optional AAC sound), or an unexpected extra track. */
  | 'wrong_codec'
  /** Longer than allowed. */
  | 'too_long'
  /** Bigger than 720p. */
  | 'too_large';

export interface Mp4Limits {
  maxSeconds: number;
  /** The short side may be at most this (a little slack for encoders that round up to a multiple of 16). */
  maxShortSide: number;
  maxLongSide: number;
}

interface Box {
  type: string;
  /** Where the contents start and end (end exclusive), in the buffer. */
  start: number;
  end: number;
}

/** The boxes directly inside [from, to). Stops (returns what it has) at anything malformed. */
function boxes(buf: Buffer, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      const big = buf.readBigUInt64BE(at + 8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = to - at; // "to the end"
    }
    // Malformed, or running past the bytes we have (a cut-off index reads as "no index": not fast start).
    if (size < header || at + size > to) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const child = (buf: Buffer, parent: Box, type: string): Box | undefined =>
  boxes(buf, parent.start, Math.min(parent.end, buf.length)).find((b) => b.type === type);

/** Follow a path of box types from `parent`, e.g. ['mdia', 'minf', 'stbl', 'stsd']. */
function path(buf: Buffer, parent: Box, types: string[]): Box | undefined {
  let at: Box | undefined = parent;
  for (const t of types) {
    if (!at) return undefined;
    at = child(buf, at, t);
  }
  return at;
}

/** Duration in ms from `mvhd` (version 0: 32-bit fields, version 1: 64-bit). Null if it cannot be read. */
function movieDurationMs(buf: Buffer, mvhd: Box): number | null {
  const v = buf[mvhd.start];
  const p = mvhd.start + 4;
  if (v === 1) {
    if (p + 28 > mvhd.end) return null;
    const timescale = buf.readUInt32BE(p + 16);
    const duration = Number(buf.readBigUInt64BE(p + 20));
    return timescale ? Math.round((duration / timescale) * 1000) : null;
  }
  if (p + 16 > mvhd.end) return null;
  const timescale = buf.readUInt32BE(p + 8);
  const duration = buf.readUInt32BE(p + 12);
  return timescale ? Math.round((duration / timescale) * 1000) : null;
}

/** Width and height from `tkhd` (16.16 fixed point, at the end of the box). */
function trackSize(buf: Buffer, tkhd: Box): { width: number; height: number } | null {
  if (tkhd.end - tkhd.start < 84 || tkhd.end > buf.length) return null;
  return {
    width: Math.round(buf.readUInt32BE(tkhd.end - 8) / 65536),
    height: Math.round(buf.readUInt32BE(tkhd.end - 4) / 65536),
  };
}

const handlerOf = (buf: Buffer, hdlr: Box): string =>
  hdlr.start + 12 <= hdlr.end ? buf.toString('latin1', hdlr.start + 8, hdlr.start + 12) : '';

/** The first sample entry's 4-letter codec in `stsd` (after version/flags and the entry count). */
const codecOf = (buf: Buffer, stsd: Box): string =>
  stsd.start + 16 <= stsd.end ? buf.toString('latin1', stsd.start + 12, stsd.start + 16) : '';

/**
 * Check the first bytes of an uploaded video (`head`; at least the whole `moov` box must be in it, which it is for a
 * fast-start file). `totalSize` is the stored object's size.
 */
export function inspectMp4(head: Buffer, totalSize: number, limits: Mp4Limits): Mp4Verdict {
  const top = boxes(head, 0, head.length);
  if (top[0]?.type !== 'ftyp') return { ok: false, reason: 'not_mp4' };
  const moovAt = top.findIndex((b) => b.type === 'moov');
  const mdatAt = top.findIndex((b) => b.type === 'mdat');
  // No index before the data (or none in what we read): not fast start.
  if (moovAt === -1 || (mdatAt !== -1 && mdatAt < moovAt)) return { ok: false, reason: 'not_fast_start' };
  const moov = top[moovAt]!;
  if (moov.end > totalSize) return { ok: false, reason: 'not_fast_start' };

  const mvhd = child(head, moov, 'mvhd');
  const durationMs = mvhd ? movieDurationMs(head, mvhd) : null;
  if (durationMs === null || durationMs <= 0) return { ok: false, reason: 'not_mp4' };

  let video: { width: number; height: number } | null = null;
  let hasAudio = false;
  for (const trak of boxes(head, moov.start, moov.end).filter((b) => b.type === 'trak')) {
    const hdlr = path(head, trak, ['mdia', 'hdlr']);
    const stsd = path(head, trak, ['mdia', 'minf', 'stbl', 'stsd']);
    if (!hdlr || !stsd) return { ok: false, reason: 'not_mp4' };
    const kind = handlerOf(head, hdlr);
    const codec = codecOf(head, stsd);
    if (kind === 'vide') {
      if (video || (codec !== 'avc1' && codec !== 'avc3')) return { ok: false, reason: 'wrong_codec' };
      const tkhd = child(head, trak, 'tkhd');
      video = tkhd ? trackSize(head, tkhd) : null;
      if (!video || !video.width || !video.height) return { ok: false, reason: 'not_mp4' };
    } else if (kind === 'soun') {
      if (hasAudio || codec !== 'mp4a') return { ok: false, reason: 'wrong_codec' };
      hasAudio = true;
    } else {
      return { ok: false, reason: 'wrong_codec' };
    }
  }
  if (!video) return { ok: false, reason: 'wrong_codec' };
  // Half a second of slack: encoders round the last frame's length.
  if (durationMs > limits.maxSeconds * 1000 + 500) return { ok: false, reason: 'too_long' };
  const short = Math.min(video.width, video.height);
  const long = Math.max(video.width, video.height);
  if (short > limits.maxShortSide || long > limits.maxLongSide) return { ok: false, reason: 'too_large' };
  return { ok: true, durationMs, width: video.width, height: video.height, hasAudio };
}
