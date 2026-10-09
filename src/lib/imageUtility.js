import { fromBase64 } from "./codec.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const LARGE_DATA_URL_CHARS = 2 * 1024 * 1024;

export function base64EncodedLength(byteLength) {
  const bytes = Math.max(0, Math.trunc(Number(byteLength) || 0));
  return Math.ceil(bytes / 3) * 4;
}

export function imageDataUrlLength(byteLength, mime = "image/*") {
  return `data:${mime || "image/*"};base64,`.length + base64EncodedLength(byteLength);
}

export function clampInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function gridSlices(width, height, rows, columns) {
  const w = clampInteger(width, 1, 12000);
  const h = clampInteger(height, 1, 12000);
  const r = clampInteger(rows, 1, 20, 3);
  const c = clampInteger(columns, 1, 20, 3);
  const slices = [];
  for (let row = 0; row < r; row += 1) {
    const y0 = Math.round(row * h / r);
    const y1 = Math.round((row + 1) * h / r);
    for (let column = 0; column < c; column += 1) {
      const x0 = Math.round(column * w / c);
      const x1 = Math.round((column + 1) * w / c);
      slices.push({ row: row + 1, column: column + 1, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }
  return slices;
}

export function compressionRatio(originalBytes, compressedBytes) {
  const original = Math.max(0, Number(originalBytes) || 0);
  const compressed = Math.max(0, Number(compressedBytes) || 0);
  if (!original) return 0;
  return Math.round((1 - compressed / original) * 1000) / 10;
}

export function dataUrlParts(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  return match ? { mime: match[1], base64: match[2] } : null;
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

export function imageTypeFromBytes(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extension: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg" };
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", extension: "gif" };
  if (startsWith(bytes, [0x42, 0x4d])) return { mime: "image/bmp", extension: "bmp" };
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return { mime: "image/x-icon", extension: "ico" };
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { mime: "image/webp", extension: "webp" };
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
    (String.fromCharCode(...bytes.slice(8, 12)) === "avif" || String.fromCharCode(...bytes.slice(8, 12)) === "avis")
  ) return { mime: "image/avif", extension: "avif" };
  return null;
}

export function parseBase64Image(value) {
  const input = String(value ?? "").trim();
  if (!input) throw new Error("Base64 image input is empty");
  const parts = dataUrlParts(input);
  if (input.startsWith("data:") && !parts) throw new Error("Invalid Base64 image Data URL");
  if (parts && !parts.mime.toLowerCase().startsWith("image/")) throw new Error("Data URL is not an image");
  const encoded = (parts?.base64 || input).replace(/\s+/g, "");
  if (!encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) throw new Error("Image payload exceeds 10 MB");
  let bytes;
  try {
    bytes = fromBase64(encoded);
  } catch {
    throw new Error("Invalid Base64 image data");
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image payload exceeds 10 MB");
  const detected = imageTypeFromBytes(bytes);
  if (!detected) throw new Error("Unsupported or unrecognized image data");
  const aliases = { "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/vnd.microsoft.icon": "image/x-icon" };
  const declaredMime = parts ? aliases[parts.mime.toLowerCase()] || parts.mime.toLowerCase() : "";
  if (parts && declaredMime !== detected.mime) throw new Error("Image MIME type does not match its contents");
  return { bytes, ...detected };
}
