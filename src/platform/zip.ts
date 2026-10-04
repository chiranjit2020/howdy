import { crc32 } from 'node:zlib';

/**
 * A minimal ZIP writer (stored entries, no compression) that streams: each entry is written as soon as its bytes are
 * known, so only one file is ever held in memory and the response can start before the last photo is read. Stored is
 * enough here — the photos are already-compressed WebP and the JSON is small. No ZIP64: an archive must stay under
 * 4 GB and 65,535 entries, far beyond anything one person's export can reach.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  name: string;
  /** The bytes, or null to leave the entry out (e.g. a file that has gone missing in storage). */
  read: () => Promise<Uint8Array | null>;
}

const UTF8_FLAG = 0x0800;
/** 1980-01-01 00:00, the earliest DOS date: entries carry no real timestamp (nothing to leak, archives reproducible). */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function localHeader(name: Buffer, crc: number, size: number): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(UTF8_FLAG, 6);
  h.writeUInt16LE(0, 8); // stored
  h.writeUInt16LE(DOS_TIME, 10);
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(size, 18);
  h.writeUInt32LE(size, 22);
  h.writeUInt16LE(name.length, 26);
  h.writeUInt16LE(0, 28); // extra length
  return Buffer.concat([h, name]);
}

function centralHeader(name: Buffer, crc: number, size: number, offset: number): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4); // version made by
  h.writeUInt16LE(20, 6); // version needed
  h.writeUInt16LE(UTF8_FLAG, 8);
  h.writeUInt16LE(0, 10);
  h.writeUInt16LE(DOS_TIME, 12);
  h.writeUInt16LE(DOS_DATE, 14);
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(size, 20);
  h.writeUInt32LE(size, 24);
  h.writeUInt16LE(name.length, 28);
  // extra, comment, disk number, internal and external attributes: all zero
  h.writeUInt32LE(offset, 42);
  return Buffer.concat([h, name]);
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const h = Buffer.alloc(22);
  h.writeUInt32LE(0x06054b50, 0);
  h.writeUInt16LE(count, 8);
  h.writeUInt16LE(count, 10);
  h.writeUInt32LE(size, 12);
  h.writeUInt32LE(offset, 16);
  return h;
}

/**
 * A ReadableStream of a ZIP holding `entries`, in order. Entries are read one at a time, only when the consumer pulls,
 * so a slow download never makes the server buffer the whole archive. If reading an entry throws, the stream errors
 * (the download fails visibly rather than producing a quietly incomplete file).
 */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let index = 0;
  let count = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (index < entries.length) {
        const entry = entries[index++]!;
        const bytes = await entry.read();
        if (!bytes) continue;
        const name = Buffer.from(entry.name, 'utf8');
        const crc = crc32(bytes);
        const header = localHeader(name, crc, bytes.byteLength);
        central.push(centralHeader(name, crc, bytes.byteLength, offset));
        offset += header.length + bytes.byteLength;
        count++;
        controller.enqueue(new Uint8Array(header));
        controller.enqueue(bytes);
        return;
      }
      const dir = Buffer.concat(central);
      controller.enqueue(
        new Uint8Array(Buffer.concat([dir, endOfCentralDirectory(count, dir.length, offset)])),
      );
      controller.close();
    },
  });
}
