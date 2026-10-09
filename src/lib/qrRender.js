import { pick } from './locale.js';
import { loadAssetModule } from "./assetModules.js";

export const CODE_TYPES = [
  { id: "qr", zh: "QR Code", en: "QR Code" },
  { id: "hanxin", zh: "汉信码", en: "Han Xin" },
  { id: "pdf417", zh: "PDF417", en: "PDF417" },
  { id: "datamatrix", zh: "Data Matrix", en: "Data Matrix" },
];

export const QR_ECC_LEVELS = [
  { id: "L", pct: 7 },
  { id: "M", pct: 15 },
  { id: "Q", pct: 25 },
  { id: "H", pct: 30 },
];

export const HANXIN_ECC_LEVELS = [
  { id: "1", pct: 8 },
  { id: "2", pct: 15 },
  { id: "3", pct: 23 },
  { id: "4", pct: 30 },
];

export const PDF417_ECC_LEVELS = Array.from({ length: 9 }, (_, id) => ({
  id: String(id),
  pct: id,
}));

export const QR_SIZES = [300, 400, 500, 600];
export const QR_MARGINS = [1, 2, 4, 8];
export const QR_VERSIONS = Array.from({ length: 40 }, (_, i) => {
  const id = i + 1;
  return { id: String(id), modules: id * 4 + 17 };
});
export const HANXIN_VERSIONS = Array.from({ length: 20 }, (_, i) => {
  const id = i + 1;
  return { id: String(id), modules: 21 + id * 2 };
});
export const DM_VERSIONS = [10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48, 52, 64, 72, 80, 88, 96, 104, 120, 132, 144].map((n) => ({
  id: `${n}x${n}`,
  modules: n,
}));

export const QR_STYLE_PRESETS = [
  { id: "basic", zh: "基础样式", en: "Basic", moduleStyle: "square", dark: "#111111", light: "#ffffff" },
  { id: "rounded", zh: "圆角模块", en: "Rounded", moduleStyle: "rounded", dark: "#111111", light: "#ffffff" },
  { id: "dots", zh: "圆点", en: "Dots", moduleStyle: "dots", dark: "#111111", light: "#ffffff" },
  { id: "blue", zh: "靛蓝", en: "Indigo", moduleStyle: "rounded", dark: "#1d4ed8", light: "#eff6ff" },
  { id: "invert", zh: "反色", en: "Inverted", moduleStyle: "square", dark: "#f8fafc", light: "#0f172a" },
];

export function clampQrSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 400;
  return Math.max(128, Math.min(2048, Math.round(n)));
}

export function matchQrStyle(moduleStyle, dark, light) {
  return QR_STYLE_PRESETS.find((item) => item.moduleStyle === moduleStyle && item.dark === dark && item.light === light) || null;
}

export function typeLabel(type, locale) {
  const item = CODE_TYPES.find((entry) => entry.id === type) || CODE_TYPES[0];
  return pick(locale, item.zh, item.en);
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo"));
    img.src = src;
  });
}

function drawContained(ctx, img, x, y, w, h) {
  const scale = Math.min(w / Math.max(1, img.width), h / Math.max(1, img.height));
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function logoRatio(ecc) {
  if (ecc === "H" || ecc === "4") return 0.22;
  if (ecc === "Q" || ecc === "3") return 0.18;
  return 0.14;
}

async function overlayLogo(ctx, width, height, logoSrc, ecc, light) {
  const img = await loadImage(logoSrc);
  const minSide = Math.min(width, height);
  const logoPx = Math.max(16, Math.round(minSide * logoRatio(ecc)));
  const pad = Math.max(2, Math.round(minSide * 0.02));
  const box = logoPx + pad * 2;
  const bx = (width - box) / 2;
  const by = (height - box) / 2;
  ctx.fillStyle = light || "#ffffff";
  roundRect(ctx, bx, by, box, box, Math.min(pad, 8));
  ctx.fill();
  drawContained(ctx, img, bx + pad, by + pad, logoPx, logoPx);
}

function hexColor(value) {
  return String(value || "#111111").replace(/^#/, "");
}

function scaleCanvas(source, targetW, targetH) {
  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return out;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Render a QR code as a self-contained SVG for lossless export. */
export async function renderQrSvg(text, options = {}) {
  const { default: QRCode } = await import("qrcode");
  const ecc = options.errorCorrectionLevel || "M";
  const margin = Math.max(0, Number(options.margin) || 0);
  const requested = clampQrSize(options.width);
  const moduleStyle = options.moduleStyle || "square";
  const dark = options.dark || "#111111";
  const light = options.light || "#ffffff";
  const createOpts = { errorCorrectionLevel: ecc };
  if (options.version) createOpts.version = Number(options.version);
  const qr = QRCode.create(text, createOpts);
  const size = qr.modules.size;
  const n = size + margin * 2;
  const width = Math.max(requested, n * 2);
  const cell = width / n;
  const rects = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!qr.modules.get(row, col)) continue;
      const x = (col + margin) * cell;
      const y = (row + margin) * cell;
      const rigid = qr.modules.isReserved(row, col);
      const style = rigid ? "square" : moduleStyle;
      const inset = style === "square" ? 0 : cell * 0.08;
      const radius = style === "dots" ? cell / 2 : style === "rounded" ? cell * 0.32 : 0;
      rects.push(`<rect x="${x + inset}" y="${y + inset}" width="${Math.max(0, cell - inset * 2)}" height="${Math.max(0, cell - inset * 2)}" rx="${radius}" fill="${xmlEscape(dark)}"/>`);
    }
  }
  const logo = options.logoSrc
    ? `<image href="${xmlEscape(options.logoSrc)}" x="${width * 0.39}" y="${width * 0.39}" width="${width * 0.22}" height="${width * 0.22}" preserveAspectRatio="xMidYMid meet"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" role="img"><rect width="100%" height="100%" fill="${xmlEscape(light)}"/>${rects.join("")}${logo}</svg>`;
  return {
    svg,
    dataUrl: svgDataUrl(svg),
    version: qr.version,
    modules: size,
    errorCorrectionLevel: ecc,
    width,
    height: width,
    type: "qr",
  };
}

export async function renderQr(text, options = {}) {
  const { default: QRCode } = await import("qrcode");
  const ecc = options.errorCorrectionLevel || "M";
  const margin = Math.max(0, Number(options.margin) || 0);
  const requested = clampQrSize(options.width);
  const moduleStyle = options.moduleStyle || "square";
  const dark = options.dark || "#111111";
  const light = options.light || "#ffffff";
  const createOpts = { errorCorrectionLevel: ecc };
  if (options.version) createOpts.version = Number(options.version);

  const qr = QRCode.create(text, createOpts);
  const size = qr.modules.size;
  const n = size + margin * 2;
  const width = Math.max(requested, n * 2);
  const cell = width / n;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, width);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!qr.modules.get(row, col)) continue;
      const x = (col + margin) * cell;
      const y = (row + margin) * cell;
      const rigid = qr.modules.isReserved(row, col);
      const style = rigid ? "square" : moduleStyle;
      ctx.fillStyle = dark;
      if (style === "dots") {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (style === "rounded") {
        roundRect(ctx, x + cell * 0.08, y + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.32);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, cell + 0.4, cell + 0.4);
      }
    }
  }

  if (options.logoSrc) await overlayLogo(ctx, width, width, options.logoSrc, ecc, light);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    version: qr.version,
    modules: size,
    errorCorrectionLevel: ecc,
    width,
    height: width,
    type: "qr",
  };
}

async function renderBwip(type, text, options = {}) {
  const { toCanvas } = await loadAssetModule("barcode");
  const requested = clampQrSize(options.width);
  const dark = options.dark || "#111111";
  const light = options.light || "#ffffff";
  const margin = Math.max(0, Number(options.margin) || 0);
  const canvas = document.createElement("canvas");
  const opts = {
    bcid: type,
    text,
    includetext: false,
    backgroundcolor: hexColor(light),
    barcolor: hexColor(dark),
    padding: margin * 2,
    scale: 4,
  };

  if (type === "hanxin") {
    opts.eclevel = `L${Number(options.errorCorrectionLevel) || 2}`;
    if (options.version) opts.version = Number(options.version);
  } else if (type === "pdf417") {
    const level = Number(options.errorCorrectionLevel ?? 2);
    opts.securitylevel = Number.isInteger(level) && level >= 0 && level <= 8 ? level : 2;
  } else if (type === "datamatrix" && options.version) {
    opts.version = String(options.version);
  }

  try {
    toCanvas(canvas, opts);
  } catch (err) {
    throw new Error(typeof err === "string" ? err : err?.message || String(err));
  }

  const srcW = canvas.width || 1;
  const srcH = canvas.height || 1;
  const scale = requested / Math.max(srcW, srcH);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const out = scaleCanvas(canvas, outW, outH);
  const ctx = out.getContext("2d");
  if (options.logoSrc) await overlayLogo(ctx, outW, outH, options.logoSrc, options.errorCorrectionLevel, light);

  return {
    dataUrl: out.toDataURL("image/png"),
    version: options.version || "",
    modules: 0,
    errorCorrectionLevel: options.errorCorrectionLevel || "",
    width: outW,
    height: outH,
    type,
  };
}

export function dataUrlToBlob(dataUrl) {
  const source = String(dataUrl || "");
  const comma = source.indexOf(",");
  if (comma < 0) throw new Error("invalid image");
  const header = source.slice(0, comma);
  const body = source.slice(comma + 1);
  const mime = /data:([^;,]+)/i.exec(header)?.[1] || "image/png";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function renderBarcode(text, options = {}) {
  const type = options.type || "qr";
  if (type === "qr") return renderQr(text, options);
  return renderBwip(type, text, options);
}
