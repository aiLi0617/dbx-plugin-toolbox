export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_SIDE = 12_000;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeCrop(sourceWidth, sourceHeight, crop = {}) {
  const sw = Math.trunc(finiteNumber(sourceWidth));
  const sh = Math.trunc(finiteNumber(sourceHeight));
  if (sw < 1 || sh < 1) throw new Error("Image dimensions are invalid");
  const x = Math.max(0, Math.min(sw - 1, Math.trunc(finiteNumber(crop.x))));
  const y = Math.max(0, Math.min(sh - 1, Math.trunc(finiteNumber(crop.y))));
  const width = Math.max(1, Math.min(sw - x, Math.trunc(finiteNumber(crop.width, sw - x))));
  const height = Math.max(1, Math.min(sh - y, Math.trunc(finiteNumber(crop.height, sh - y))));
  return { x, y, width, height };
}

export function normalizeOutputSize(width, height) {
  const normalized = {
    width: Math.max(1, Math.min(MAX_IMAGE_SIDE, Math.round(finiteNumber(width, 1)))),
    height: Math.max(1, Math.min(MAX_IMAGE_SIDE, Math.round(finiteNumber(height, 1)))),
  };
  if (normalized.width * normalized.height > MAX_IMAGE_PIXELS) {
    throw new Error("Output image is limited to 40 megapixels");
  }
  return normalized;
}

export function fitDimension(value, source, otherSource) {
  const primary = Math.max(1, Math.round(finiteNumber(value, 1)));
  return Math.max(1, Math.round(primary * finiteNumber(otherSource, 1) / Math.max(1, finiteNumber(source, 1))));
}

export function normalizeRotation(value) {
  return ((Math.round(finiteNumber(value) / 90) * 90) % 360 + 360) % 360;
}

export function normalizeAngle(value) {
  return ((finiteNumber(value) % 360) + 360) % 360;
}

export function rotatedSize(width, height, rotation) {
  const size = normalizeOutputSize(width, height);
  const angle = normalizeRotation(rotation);
  return angle % 180 === 0 ? size : { width: size.height, height: size.width };
}

export function watermarkCoordinates(canvasWidth, canvasHeight, textWidth, fontSize, position = "bottom-right", margin = 18) {
  const horizontal = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
  const vertical = position.startsWith("top") ? "top" : position.startsWith("bottom") ? "bottom" : "center";
  const x = horizontal === "left" ? margin : horizontal === "right" ? canvasWidth - textWidth - margin : (canvasWidth - textWidth) / 2;
  const y = vertical === "top" ? margin + fontSize : vertical === "bottom" ? canvasHeight - margin : (canvasHeight + fontSize) / 2;
  return { x: Math.max(0, x), y: Math.max(fontSize, y) };
}

export function formatInfo(mime) {
  if (mime === "image/jpeg") return { extension: "jpg", label: "JPEG" };
  if (mime === "image/webp") return { extension: "webp", label: "WebP" };
  return { extension: "png", label: "PNG" };
}
