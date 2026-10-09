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
