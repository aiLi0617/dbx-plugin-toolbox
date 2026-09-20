import { crc32Bytes } from "./codec.js";

function crc32Number(bytes) {
  return Number.parseInt(crc32Bytes(bytes), 16) >>> 0;
}

function writeUint16LE(view, offset, value) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(view, offset, value) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
  view[offset + 2] = (value >>> 16) & 0xff;
  view[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Build an uncompressed (store-only) ZIP archive.
 * @param {{ name: string, bytes: Uint8Array }[]} files
 */
export function buildZipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(String(file.name || "file"));
    const data = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || []);
    const crc = crc32Number(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32LE(local, 0, 0x04034b50);
    writeUint16LE(local, 4, 20);
    writeUint16LE(local, 6, 0);
    writeUint16LE(local, 8, 0); // store
    writeUint16LE(local, 10, 0);
    writeUint16LE(local, 12, 0);
    writeUint32LE(local, 14, crc);
    writeUint32LE(local, 18, size);
    writeUint32LE(local, 22, size);
    writeUint16LE(local, 26, nameBytes.length);
    writeUint16LE(local, 28, 0);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(central, 0, 0x02014b50);
    writeUint16LE(central, 4, 20);
    writeUint16LE(central, 6, 20);
    writeUint16LE(central, 8, 0);
    writeUint16LE(central, 10, 0);
    writeUint16LE(central, 12, 0);
    writeUint16LE(central, 14, 0);
    writeUint32LE(central, 16, crc);
    writeUint32LE(central, 20, size);
    writeUint32LE(central, 24, size);
    writeUint16LE(central, 28, nameBytes.length);
    writeUint16LE(central, 30, 0);
    writeUint16LE(central, 32, 0);
    writeUint16LE(central, 34, 0);
    writeUint16LE(central, 36, 0);
    writeUint32LE(central, 38, 0);
    writeUint32LE(central, 42, offset);
    central.set(nameBytes, 46);

    localParts.push(local, data);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralDir = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32LE(end, 0, 0x06054b50);
  writeUint16LE(end, 4, 0);
  writeUint16LE(end, 6, 0);
  writeUint16LE(end, 8, files.length);
  writeUint16LE(end, 10, files.length);
  writeUint32LE(end, 12, centralDir.length);
  writeUint32LE(end, 16, offset);
  writeUint16LE(end, 20, 0);

  return concatBytes([...localParts, centralDir, end]);
}
