import { crc32Bytes } from "./codec.js";
import {
  encodeBmpFromCanvas,
  encodeGifFromCanvas,
  encodeIcoFromCanvas,
  encodeSvgPlaceholder,
  encodeTiffFromCanvas,
  padBmpToSize,
  padGifToSize,
  padIcoToSize,
  padSvgToSize,
  padTiffToSize,
} from "./imageEncodeExtra.js";
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE, normalizeOutputSize } from "./imageOps.js";
import { buildZipStore } from "./zipStore.js";

export const MAX_TARGET_BYTES = 50 * 1024 * 1024;
export const MIN_TARGET_BYTES = 64;
export const SIZE_UNITS = Object.freeze(["B", "KB", "MB"]);
export const MAX_CUSTOM_TEXT = 80;

export const OUTPUT_FORMATS = Object.freeze([
  Object.freeze({ mime: "image/png", extension: "png", label: "PNG", supportsAlpha: true, lossy: false, encoder: "canvas" }),
  Object.freeze({ mime: "image/jpeg", extension: "jpg", label: "JPEG", supportsAlpha: false, lossy: true, encoder: "canvas" }),
  Object.freeze({ mime: "image/gif", extension: "gif", label: "GIF", supportsAlpha: true, lossy: false, encoder: "gif" }),
  Object.freeze({ mime: "image/webp", extension: "webp", label: "WebP", supportsAlpha: true, lossy: true, encoder: "canvas" }),
  Object.freeze({ mime: "image/bmp", extension: "bmp", label: "BMP", supportsAlpha: false, lossy: false, encoder: "bmp" }),
  Object.freeze({ mime: "image/svg+xml", extension: "svg", label: "SVG", supportsAlpha: true, lossy: false, encoder: "svg" }),
  Object.freeze({ mime: "image/x-icon", extension: "ico", label: "ICO", supportsAlpha: true, lossy: false, encoder: "ico" }),
  Object.freeze({ mime: "image/tiff", extension: "tiff", label: "TIFF", supportsAlpha: false, lossy: false, encoder: "tiff" }),
  Object.freeze({ mime: "image/avif", extension: "avif", label: "AVIF", supportsAlpha: true, lossy: true, encoder: "canvas", optional: true }),
]);

const FORMAT_BY_MIME = Object.freeze(Object.fromEntries(OUTPUT_FORMATS.map((item) => [item.mime, item])));

let avifSupported = null;

export async function detectAvifSupport() {
  if (avifSupported != null) return avifSupported;
  if (typeof document === "undefined") {
    avifSupported = false;
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    avifSupported = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(Boolean(blob)), "image/avif", 0.5);
    });
  } catch {
    avifSupported = false;
  }
  return avifSupported;
}

export async function listAvailableFormats() {
  const allowAvif = await detectAvifSupport();
  return OUTPUT_FORMATS.filter((item) => !item.optional || (item.mime === "image/avif" && allowAvif));
}

const PNG_IEND = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const PNG_MIN_PAD = 12;
const JPEG_MIN_PAD = 4;
const WEBP_MIN_PAD = 8;

function pngCrc(bytes) {
  return Number.parseInt(crc32Bytes(bytes), 16) >>> 0;
}

export function resolveOutputFormat(mime = "image/png") {
  return FORMAT_BY_MIME[mime] || FORMAT_BY_MIME["image/png"];
}

/** Output formats aligned with image-process import: PNG / JPEG / WebP / GIF / BMP (+ AVIF when encodable). */
const PROCESS_OUTPUT_MIMES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif",
]);

export const PROCESS_OUTPUT_FORMATS = Object.freeze(
  OUTPUT_FORMATS.filter((item) => PROCESS_OUTPUT_MIMES.has(item.mime)),
);

export async function listProcessFormats() {
  const allowAvif = await detectAvifSupport();
  return PROCESS_OUTPUT_FORMATS.filter((item) => !item.optional || (item.mime === "image/avif" && allowAvif));
}

export function formatInfoForMime(mime) {
  const info = resolveOutputFormat(mime);
  return { extension: info.extension, label: info.label, mime: info.mime, supportsAlpha: info.supportsAlpha };
}

export function parseTargetBytes(value, unit = "KB") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Target size is invalid");
  const key = String(unit || "KB").toUpperCase();
  const factor = key === "B" ? 1 : key === "MB" ? 1024 * 1024 : 1024;
  const bytes = Math.round(amount * factor);
  if (bytes < MIN_TARGET_BYTES) throw new Error(`Target size must be at least ${MIN_TARGET_BYTES} bytes`);
  if (bytes > MAX_TARGET_BYTES) throw new Error("Target size is limited to 50 MB");
  return bytes;
}

export function normalizeGenerateSize(width, height) {
  return normalizeOutputSize(width, height);
}

/** Clamp to side / megapixel caps instead of throwing (used by image generate). */
export function clampGenerateSize(width, height) {
  const requestedWidth = Math.max(1, Math.round(Number(width) || 1));
  const requestedHeight = Math.max(1, Math.round(Number(height) || 1));
  let w = Math.min(MAX_IMAGE_SIDE, requestedWidth);
  let h = Math.min(MAX_IMAGE_SIDE, requestedHeight);

  if (w * h > MAX_IMAGE_PIXELS) {
    const scale = Math.sqrt(MAX_IMAGE_PIXELS / (w * h));
    w = Math.max(1, Math.floor(w * scale));
    h = Math.max(1, Math.floor(h * scale));
    while (w * h > MAX_IMAGE_PIXELS) {
      if (w >= h && w > 1) w -= 1;
      else if (h > 1) h -= 1;
      else break;
    }
  }

  return {
    width: w,
    height: h,
    requestedWidth,
    requestedHeight,
    dimensionAdjusted: w !== requestedWidth || h !== requestedHeight,
  };
}

export function humanFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
}

export function sanitizeFileBase(name, fallback = "placeholder") {
  let cleaned = String(name || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  cleaned = cleaned.replace(/\.(png|jpe?g|webp|gif|bmp|avif|svg|ico|tiff?|zip)$/i, "");
  cleaned = cleaned.replace(/\.+$/g, "").replace(/-+$/g, "");
  return (cleaned.slice(0, 120) || fallback);
}

export function buildFileName(base, extension, { width, height } = {}) {
  const stem = sanitizeFileBase(
    base,
    width && height ? `placeholder-${width}x${height}` : "placeholder",
  );
  const ext = String(extension || "png").replace(/^\./, "");
  return `${stem}.${ext}`;
}

function writeUint32BE(view, offset, value) {
  view[offset] = (value >>> 24) & 0xff;
  view[offset + 1] = (value >>> 16) & 0xff;
  view[offset + 2] = (value >>> 8) & 0xff;
  view[offset + 3] = value & 0xff;
}

function writeUint16BE(view, offset, value) {
  view[offset] = (value >>> 8) & 0xff;
  view[offset + 1] = value & 0xff;
}

function writeUint32LE(view, offset, value) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
  view[offset + 2] = (value >>> 16) & 0xff;
  view[offset + 3] = (value >>> 24) & 0xff;
}

function findPngIend(bytes) {
  for (let i = bytes.length - 12; i >= 0; i -= 1) {
    if (
      bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 0
      && bytes[i + 4] === 0x49 && bytes[i + 5] === 0x45 && bytes[i + 6] === 0x4e && bytes[i + 7] === 0x44
    ) return i;
  }
  return -1;
}

function findJpegEoi(bytes) {
  for (let i = bytes.length - 2; i >= 0; i -= 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i;
  }
  return -1;
}

export function padPngToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const need = target - source.length;
  if (need < PNG_MIN_PAD) throw new Error("Padding gap is too small for PNG");
  const iend = findPngIend(source);
  if (iend < 0) throw new Error("PNG is missing IEND");
  const dataLen = need - PNG_MIN_PAD;
  const chunk = new Uint8Array(PNG_MIN_PAD + dataLen);
  writeUint32BE(chunk, 0, dataLen);
  chunk[4] = 0x64;
  chunk[5] = 0x62;
  chunk[6] = 0x58;
  chunk[7] = 0x70;
  const crc = pngCrc(chunk.subarray(4, 8 + dataLen));
  writeUint32BE(chunk, 8 + dataLen, crc);
  const out = new Uint8Array(target);
  out.set(source.subarray(0, iend), 0);
  out.set(chunk, iend);
  out.set(PNG_IEND, iend + chunk.length);
  return out;
}

export function padJpegToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const need = target - source.length;
  if (need < JPEG_MIN_PAD) throw new Error("Padding gap is too small for JPEG");
  const eoi = findJpegEoi(source);
  if (eoi < 0) throw new Error("JPEG is missing EOI");
  let remaining = need;
  const parts = [];
  while (remaining > 0) {
    const take = Math.min(remaining, 2 + 65533);
    if (take < JPEG_MIN_PAD) throw new Error("Padding gap is too small for JPEG");
    const payload = take - 4;
    const marker = new Uint8Array(take);
    marker[0] = 0xff;
    marker[1] = 0xfe;
    writeUint16BE(marker, 2, payload + 2);
    parts.push(marker);
    remaining -= take;
  }
  const padTotal = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(source.length + padTotal);
  out.set(source.subarray(0, eoi), 0);
  let offset = eoi;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  out[offset] = 0xff;
  out[offset + 1] = 0xd9;
  if (out.length !== target) throw new Error("JPEG padding failed to hit target size");
  return out;
}

/** Append a private RIFF chunk and rewrite the RIFF size so WebP hits targetBytes. */
export function padWebpToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  if (
    source.length < 12
    || source[0] !== 0x52 || source[1] !== 0x49 || source[2] !== 0x46 || source[3] !== 0x46
    || source[8] !== 0x57 || source[9] !== 0x45 || source[10] !== 0x42 || source[11] !== 0x50
  ) {
    throw new Error("WebP header is invalid");
  }
  const need = target - source.length;
  if (need < WEBP_MIN_PAD) throw new Error("Padding gap is too small for WebP");

  // growth = 8 + size + (size % 2). Prefer even size so growth === 8 + size.
  let size = need - 8;
  let filePad = size % 2;
  if (8 + size + filePad !== need) {
    size = need - 9;
    filePad = size % 2;
    if (size < 0 || 8 + size + filePad !== need) {
      throw new Error("Padding gap is too small for WebP");
    }
  }

  const chunk = new Uint8Array(8 + size + filePad);
  chunk[0] = 0x44; // D
  chunk[1] = 0x42; // B
  chunk[2] = 0x58; // X
  chunk[3] = 0x50; // P
  writeUint32LE(chunk, 4, size);
  const out = new Uint8Array(target);
  out.set(source, 0);
  out.set(chunk, source.length);
  writeUint32LE(out, 4, target - 8);
  return out;
}

export function padImageToSize(bytes, targetBytes, mime = "image/png") {
  if (mime === "image/jpeg") return padJpegToSize(bytes, targetBytes);
  if (mime === "image/webp") return padWebpToSize(bytes, targetBytes);
  if (mime === "image/bmp") return padBmpToSize(bytes, targetBytes);
  if (mime === "image/gif") return padGifToSize(bytes, targetBytes);
  if (mime === "image/svg+xml") return padSvgToSize(bytes, targetBytes);
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return padIcoToSize(bytes, targetBytes);
  if (mime === "image/tiff" || mime === "image/tif") return padTiffToSize(bytes, targetBytes);
  return padPngToSize(bytes, targetBytes);
}

function minPadForMime(mime) {
  if (mime === "image/jpeg") return JPEG_MIN_PAD;
  if (mime === "image/webp") return WEBP_MIN_PAD;
  if (mime === "image/bmp" || mime === "image/tiff" || mime === "image/tif" || mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return 1;
  if (mime === "image/gif") return 4;
  if (mime === "image/svg+xml") return 7;
  return PNG_MIN_PAD;
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image encoding failed"))),
      mime,
      quality,
    );
  });
}

/** Encode a canvas to a Blob for process/export (canvas + BMP/GIF helpers). */
export async function encodeCanvasImage(canvas, mime = "image/png", quality) {
  const format = resolveOutputFormat(mime);
  if (format.optional && format.mime === "image/avif" && !(await detectAvifSupport())) {
    throw new Error("AVIF is not supported in this environment");
  }
  if (format.mime === "image/bmp") {
    return new Blob([encodeBmpFromCanvas(canvas)], { type: format.mime });
  }
  if (format.mime === "image/gif") {
    return new Blob([encodeGifFromCanvas(canvas)], { type: format.mime });
  }
  if (format.encoder === "canvas") {
    return canvasToBlob(canvas, format.mime, format.lossy ? quality : undefined);
  }
  throw new Error(`Unsupported encode format: ${format.mime}`);
}

async function blobToBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function parseHexColor(hex, fallback = [232, 238, 245]) {
  const raw = String(hex || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return [0, 1, 2].map((i) => Number.parseInt(raw[i] + raw[i], 16));
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return [0, 2, 4].map((i) => Number.parseInt(raw.slice(i, i + 2), 16));
  }
  return fallback;
}

function mixRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function rgbCss(rgb, alpha = 1) {
  if (alpha >= 1) return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function relativeLuminance(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function roundRectPath(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDbxBadge(ctx, width, height, dark) {
  const edge = Math.min(width, height);
  if (edge < 40) return;

  // Scale with the short side (previously hard-capped at 18px).
  let fontSize = Math.max(8, Math.min(96, Math.round(edge / 22)));
  const margin = Math.max(6, Math.round(edge / 28));
  const maxBadgeW = Math.max(40, width - margin * 2);

  ctx.save();
  for (let guard = 0; guard < 8; guard += 1) {
    const padX = Math.round(fontSize * 0.72);
    const padY = Math.round(fontSize * 0.42);
    const mark = Math.max(5, Math.round(fontSize * 0.72));
    const gap = Math.max(3, Math.round(fontSize * 0.38));
    ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    const textWidth = ctx.measureText("dbx").width;
    const badgeW = padX * 2 + mark + gap + textWidth;
    const badgeH = padY * 2 + fontSize;

    if (badgeW > maxBadgeW && fontSize > 8) {
      fontSize = Math.max(8, Math.floor(fontSize * (maxBadgeW / badgeW)));
      continue;
    }

    const x = width - margin - badgeW;
    const y = height - margin - badgeH;
    if (x >= 0 && y >= 0) {
      ctx.shadowColor = dark ? "rgba(0,0,0,0.28)" : "rgba(15,23,42,0.16)";
      ctx.shadowBlur = Math.max(3, Math.round(fontSize * 0.35));
      ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.08));
      roundRectPath(ctx, x, y, badgeW, badgeH, badgeH / 2);
      ctx.fillStyle = dark ? "rgba(250,250,250,0.92)" : "rgba(23,23,23,0.88)";
      ctx.fill();
      ctx.shadowColor = "transparent";

      const markX = x + padX;
      const markY = y + (badgeH - mark) / 2;
      roundRectPath(ctx, markX, markY, mark, mark, Math.max(1.5, mark * 0.28));
      ctx.fillStyle = dark ? "rgb(23 23 23)" : "rgb(250 250 250)";
      ctx.fill();

      ctx.fillStyle = dark ? "rgb(23 23 23)" : "rgb(250 250 250)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("dbx", markX + mark + gap, y + badgeH / 2 + 0.5);
    }
    break;
  }
  ctx.restore();
}

function normalizeCustomText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length > MAX_CUSTOM_TEXT) throw new Error("Custom text is too long");
  return text;
}

function drawPlaceholder(canvas, options) {
  const {
    width,
    height,
    background = "#d7e4f2",
    foreground = "#1e293b",
    transparent = false,
    showText = true,
    showBorder = false,
    label = "",
    sizeLabel = "",
  } = options;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  const base = parseHexColor(background, [215, 228, 242]);
  const ink = parseHexColor(foreground, [30, 41, 59]);
  const darkBg = transparent ? relativeLuminance(ink) > 0.62 : relativeLuminance(base) < 0.48;
  const soft = mixRgb(base, ink, darkBg ? 0.18 : 0.12);
  const light = mixRgb(base, [255, 255, 255], darkBg ? 0.12 : 0.42);
  const deep = mixRgb(base, [15, 23, 42], darkBg ? 0.28 : 0.16);
  const edge = Math.min(width, height);

  if (!transparent) {
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, rgbCss(light));
    wash.addColorStop(0.55, rgbCss(base));
    wash.addColorStop(1, rgbCss(deep));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
      width * 0.22, height * 0.2, 0,
      width * 0.22, height * 0.2, Math.max(width, height) * 0.7,
    );
    glow.addColorStop(0, rgbCss([255, 255, 255], darkBg ? 0.12 : 0.38));
    glow.addColorStop(1, rgbCss([255, 255, 255], 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.globalAlpha = transparent ? (darkBg ? 0.18 : 0.14) : (darkBg ? 0.2 : 0.28);
  ctx.fillStyle = transparent ? rgbCss(ink, 0.2) : rgbCss(soft, 0.55);
  ctx.beginPath();
  ctx.arc(width * 0.82, height * 0.22, edge * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.12, height * 0.78, edge * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (showBorder) {
    const frame = Math.max(1, Math.round(edge / 220));
    ctx.strokeStyle = rgbCss(ink, transparent ? 0.28 : (darkBg ? 0.22 : 0.14));
    ctx.lineWidth = frame;
    ctx.strokeRect(frame / 2, frame / 2, width - frame, height - frame);
  }

  if (showText) {
    const text = label || `${width} × ${height}`;
    const sizeText = sizeLabel || "";
    const titleSize = Math.max(14, Math.min(72, Math.floor(edge / 9)));
    const subSize = Math.max(9, Math.min(18, Math.floor(titleSize * 0.28)));
    const cardPadX = Math.max(16, Math.round(titleSize * 0.85));
    const cardPadY = Math.max(12, Math.round(titleSize * 0.55));
    const showSub = edge >= 96 && sizeText;

    ctx.font = `700 ${titleSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    const titleWidth = ctx.measureText(text).width;
    ctx.font = `600 ${subSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    const subWidth = showSub ? ctx.measureText(sizeText).width : 0;
    const contentW = Math.max(titleWidth, subWidth);
    const cardW = Math.min(width * 0.86, contentW + cardPadX * 2);
    const cardH = cardPadY * 2 + titleSize + (showSub ? subSize + Math.round(titleSize * 0.28) : 0);
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2;
    const cardRadius = Math.max(8, Math.min(22, edge / 28));

    ctx.save();
    ctx.shadowColor = darkBg ? "rgba(0,0,0,0.35)" : "rgba(15,23,42,0.14)";
    ctx.shadowBlur = Math.max(8, edge / 28);
    ctx.shadowOffsetY = Math.max(2, edge / 120);
    roundRectPath(ctx, cardX, cardY, cardW, cardH, cardRadius);
    ctx.fillStyle = transparent
      ? (darkBg ? "rgba(15,23,42,0.62)" : "rgba(255,255,255,0.78)")
      : (darkBg ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.72)");
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = darkBg ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";
    ctx.lineWidth = Math.max(1, edge / 400);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = rgbCss(ink);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${titleSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
    const titleY = showSub ? cardY + cardPadY + titleSize * 0.52 : cardY + cardH / 2;
    ctx.fillText(text, width / 2, titleY, cardW - cardPadX);

    if (showSub) {
      ctx.fillStyle = rgbCss(ink, 0.62);
      ctx.font = `600 ${subSize}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
      ctx.fillText(sizeText, width / 2, cardY + cardH - cardPadY - subSize * 0.35, cardW - cardPadX);
    }
  }

  drawDbxBadge(ctx, width, height, darkBg);
}

async function encodeNearOrUnder(canvas, mime, targetBytes, svgOptions = null) {
  if (mime === "image/bmp") {
    const bytes = encodeBmpFromCanvas(canvas);
    return { blob: new Blob([bytes], { type: mime }), bytes, quality: null };
  }
  if (mime === "image/gif") {
    const bytes = encodeGifFromCanvas(canvas);
    return { blob: new Blob([bytes], { type: mime }), bytes, quality: null };
  }
  if (mime === "image/svg+xml") {
    const bytes = encodeSvgPlaceholder(svgOptions || {});
    return { blob: new Blob([bytes], { type: mime }), bytes, quality: null };
  }
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") {
    const bytes = await encodeIcoFromCanvas(canvas);
    return { blob: new Blob([bytes], { type: "image/x-icon" }), bytes, quality: null };
  }
  if (mime === "image/tiff" || mime === "image/tif") {
    const bytes = encodeTiffFromCanvas(canvas);
    return { blob: new Blob([bytes], { type: "image/tiff" }), bytes, quality: null };
  }
  if (mime === "image/png") {
    const blob = await canvasToBlob(canvas, mime);
    return { blob, bytes: await blobToBytes(blob), quality: null };
  }

  let low = 0.05;
  let high = 0.95;
  let best = null;
  for (let i = 0; i < 10; i += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, mime, quality);
    const bytes = await blobToBytes(blob);
    if (bytes.length <= targetBytes) {
      best = { blob, bytes, quality };
      low = quality;
    } else {
      high = quality;
    }
  }
  if (best) return best;
  const blob = await canvasToBlob(canvas, mime, 0.05);
  return { blob, bytes: await blobToBytes(blob), quality: 0.05 };
}

function nudgeCanvas(canvas, seed) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const x = seed % width;
  const y = Math.floor(seed / width) % height;
  const pixel = ctx.getImageData(x, y, 1, 1);
  pixel.data[0] = (pixel.data[0] + 1 + (seed % 3)) % 256;
  pixel.data[1] = (pixel.data[1] + 2 + (seed % 5)) % 256;
  pixel.data[2] = (pixel.data[2] + 3 + (seed % 7)) % 256;
  if (pixel.data[3] === 0) pixel.data[3] = 1;
  ctx.putImageData(pixel, x, y);
}

function prepareEncodeCanvas(source, mime, transparent, background) {
  const format = resolveOutputFormat(mime);
  if (format.supportsAlpha || !transparent) return source;

  // JPEG (and other opaque formats) need an opaque matte.
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = background || "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Generate a placeholder image with exact pixel size and exact file size.
 */
export async function generateSizedImage(options = {}) {
  const {
    width,
    height,
    targetBytes,
    mime = "image/png",
    background = "#d7e4f2",
    foreground = "#1e293b",
    transparent = false,
    showText = true,
    showBorder = false,
    customText = "",
    fileBase = "",
  } = options;

  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("Image generation requires a browser canvas");
  }

  const {
    width: outWidth,
    height: outHeight,
    requestedWidth,
    requestedHeight,
    dimensionAdjusted,
  } = clampGenerateSize(width, height);
  const size = { width: outWidth, height: outHeight };
  const requestedTarget = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(requestedTarget) || requestedTarget < MIN_TARGET_BYTES || requestedTarget > MAX_TARGET_BYTES) {
    throw new Error("Target size is invalid");
  }

  const format = resolveOutputFormat(mime);
  if (format.optional && format.mime === "image/avif" && !(await detectAvifSupport())) {
    throw new Error("AVIF is not supported in this environment");
  }
  const useTransparent = Boolean(transparent) && format.supportsAlpha;
  const text = normalizeCustomText(customText);
  const minPad = minPadForMime(format.mime);

  function svgOptionsFor(sizeBytes) {
    return {
      width: size.width,
      height: size.height,
      background,
      foreground,
      transparent: useTransparent || Boolean(transparent),
      showText,
      showBorder,
      label: text || `${size.width} × ${size.height}`,
      sizeLabel: text ? "" : humanFileSize(sizeBytes),
    };
  }

  function paint(sizeBytes) {
    if (format.mime === "image/svg+xml") return null;
    const drawn = document.createElement("canvas");
    drawPlaceholder(drawn, svgOptionsFor(sizeBytes));
    return prepareEncodeCanvas(drawn, format.mime, Boolean(transparent), background);
  }

  async function encodeAt(sizeBytes, canvas) {
    return encodeNearOrUnder(canvas, format.mime, sizeBytes, svgOptionsFor(sizeBytes));
  }

  let target = requestedTarget;
  let sizeAdjusted = false;
  let canvas = paint(target);
  let encoded = await encodeAt(target, canvas);

  // Target too small for this pixel count / format: raise to the smallest encodable size.
  if (encoded.bytes.length > target) {
    if (encoded.bytes.length > MAX_TARGET_BYTES) {
      throw new Error("Encoded image exceeds the 50 MB limit; reduce dimensions");
    }
    target = encoded.bytes.length;
    sizeAdjusted = true;
    canvas = paint(target);
    encoded = await encodeAt(target, canvas);
    if (encoded.bytes.length > target) {
      target = encoded.bytes.length;
      if (target > MAX_TARGET_BYTES) {
        throw new Error("Encoded image exceeds the 50 MB limit; reduce dimensions");
      }
    }
  }

  for (let attempt = 0; attempt < 48 && encoded.bytes.length < target && target - encoded.bytes.length < minPad; attempt += 1) {
    if (canvas) nudgeCanvas(canvas, attempt + 1);
    else break;
    encoded = await encodeAt(target, canvas);
    if (encoded.bytes.length > target) {
      target = encoded.bytes.length;
      sizeAdjusted = true;
      break;
    }
  }

  if (format.mime === "image/webp") {
    for (let attempt = 0; attempt < 24 && encoded.bytes.length < target; attempt += 1) {
      const gap = target - encoded.bytes.length;
      if (gap >= WEBP_MIN_PAD && (gap % 2 === 0 || gap >= WEBP_MIN_PAD + 1)) break;
      if (!canvas) break;
      nudgeCanvas(canvas, 100 + attempt);
      encoded = await encodeAt(target, canvas);
      if (encoded.bytes.length > target) {
        target = encoded.bytes.length;
        sizeAdjusted = true;
        break;
      }
    }
  }

  if (encoded.bytes.length < target && target - encoded.bytes.length < minPad) {
    target = encoded.bytes.length;
    sizeAdjusted = true;
  }

  const bytes = encoded.bytes.length === target
    ? encoded.bytes
    : padImageToSize(encoded.bytes, target, format.mime);
  const blob = new Blob([bytes], { type: format.mime });
  const fileName = buildFileName(fileBase, format.extension, size);
  return {
    blob,
    bytes,
    width: size.width,
    height: size.height,
    size: bytes.length,
    mime: format.mime,
    extension: format.extension,
    label: format.label,
    quality: encoded.quality,
    transparent: useTransparent,
    fileName,
    fileBase: sanitizeFileBase(fileBase, `placeholder-${size.width}x${size.height}`),
    requestedSize: requestedTarget,
    sizeAdjusted,
    requestedWidth,
    requestedHeight,
    dimensionAdjusted,
  };
}

export async function generateAllFormats(options = {}) {
  const formats = await listAvailableFormats();
  const results = [];
  const errors = [];
  for (const format of formats) {
    try {
      results.push(await generateSizedImage({ ...options, mime: format.mime }));
    } catch (cause) {
      errors.push({ mime: format.mime, label: format.label, error: cause });
    }
  }
  if (!results.length) {
    throw errors[0]?.error || new Error("Image encoding failed");
  }
  return { results, errors };
}

export function buildFormatsZip(results, fileBase = "placeholder") {
  const stem = sanitizeFileBase(fileBase, "placeholder");
  const files = results.map((item) => ({
    name: `${stem}.${item.extension}`,
    bytes: item.bytes instanceof Uint8Array ? item.bytes : new Uint8Array(item.bytes),
  }));
  const bytes = buildZipStore(files);
  return {
    bytes,
    blob: new Blob([bytes], { type: "application/zip" }),
    fileName: `${stem}-images.zip`,
    mime: "application/zip",
    count: files.length,
  };
}
