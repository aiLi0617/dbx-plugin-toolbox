import { fromBase64, textToBytes, toBase64 } from "./codec.js";

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;

async function transformBytes(bytes, StreamType, outputLimit) {
  if (typeof StreamType !== "function") throw new Error("Gzip streams are not supported by this runtime");
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamType("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > outputLimit) {
      await reader.cancel();
      throw new Error("Gzip output exceeds the size limit");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function transformBlob(blob, StreamType, outputLimit) {
  if (typeof StreamType !== "function") throw new Error("Gzip streams are not supported by this runtime");
  const reader = blob.stream().pipeThrough(new StreamType("gzip")).getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > outputLimit) { await reader.cancel(); throw new Error("Gzip output exceeds the size limit"); }
    chunks.push(value);
  }
  return new Blob(chunks, { type: "application/gzip" });
}

export function inspectGzipHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (bytes.length < 10 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) throw new Error("Invalid Gzip header");
  const flags = bytes[3];
  const modifiedAt = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  return { method: "DEFLATE", flags, modifiedAt: modifiedAt >>> 0, extraFlags: bytes[8], operatingSystem: bytes[9] };
}

export async function gzipCompressFile(file) {
  if (!(file instanceof Blob)) throw new Error("Choose a file to compress");
  const output = await transformBlob(file, globalThis.CompressionStream, 512 * 1024 * 1024);
  return { blob: output, inputBytes: file.size, outputBytes: output.size, ratio: file.size ? output.size / file.size : 0, header: inspectGzipHeader(new Uint8Array(await output.slice(0, 10).arrayBuffer())) };
}

export async function gzipDecompressFile(file) {
  if (!(file instanceof Blob)) throw new Error("Choose a Gzip file to decompress");
  const header = inspectGzipHeader(new Uint8Array(await file.slice(0, 10).arrayBuffer()));
  const output = await transformBlob(file, globalThis.DecompressionStream, 512 * 1024 * 1024);
  return { blob: output, inputBytes: file.size, outputBytes: output.size, ratio: file.size ? output.size / file.size : 0, header };
}

export async function gzipCompressText(text) {
  const bytes = textToBytes(String(text ?? ""));
  if (bytes.length > MAX_INPUT_BYTES) throw new Error("Text input exceeds 5 MB");
  const compressed = await transformBytes(bytes, globalThis.CompressionStream, MAX_OUTPUT_BYTES);
  return { base64: toBase64(compressed), inputBytes: bytes.length, outputBytes: compressed.length };
}

export async function gzipDecompressText(value) {
  const input = String(value ?? "").trim();
  const encoded = input.replace(/^data:application\/(?:gzip|x-gzip);base64,/i, "").replace(/\s+/g, "");
  if (!encoded) throw new Error("Gzip Base64 input is empty");
  if (encoded.length > Math.ceil(MAX_INPUT_BYTES / 3) * 4 + 4) throw new Error("Gzip input exceeds 5 MB");
  let compressed;
  try {
    compressed = fromBase64(encoded);
  } catch {
    throw new Error("Invalid Base64 data");
  }
  if (compressed.length > MAX_INPUT_BYTES) throw new Error("Gzip input exceeds 5 MB");
  let decompressed;
  try {
    decompressed = await transformBytes(compressed, globalThis.DecompressionStream, MAX_OUTPUT_BYTES);
  } catch (error) {
    if (/size limit|not supported/i.test(error?.message || "")) throw error;
    throw new Error("Invalid or corrupted Gzip data");
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(decompressed);
  } catch {
    throw new Error("Decompressed data is not valid UTF-8 text");
  }
  return { text, inputBytes: compressed.length, outputBytes: decompressed.length };
}
