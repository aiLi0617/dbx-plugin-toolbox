export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_SIDE = 12_000;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  if (mime === "image/gif") return { extension: "gif", label: "GIF" };
  if (mime === "image/bmp") return { extension: "bmp", label: "BMP" };
  if (mime === "image/avif") return { extension: "avif", label: "AVIF" };
  return { extension: "png", label: "PNG" };
}

/** Rotate a point around a center by degrees (counter-clockwise). */
export function rotatePoint(point, centerX, centerY, degrees) {
  const radians = finiteNumber(degrees) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = finiteNumber(point?.x) - centerX;
  const y = finiteNumber(point?.y) - centerY;
  return { x: centerX + x * cosine - y * sine, y: centerY + x * sine + y * cosine };
}

/** Four corners of an axis-aligned crop, rotated in source-pixel space. */
export function cropCorners(x, y, width, height, angle = 0) {
  const left = finiteNumber(x);
  const top = finiteNumber(y);
  const w = Math.max(1, finiteNumber(width, 1));
  const h = Math.max(1, finiteNumber(height, 1));
  const centerX = left + w / 2;
  const centerY = top + h / 2;
  const degrees = finiteNumber(angle);
  return [
    { x: left, y: top },
    { x: left + w, y: top },
    { x: left + w, y: top + h },
    { x: left, y: top + h },
  ].map((point) => rotatePoint(point, centerX, centerY, degrees));
}

/** Axis-aligned bounding box of a (possibly rotated) crop rectangle. */
export function rotatedCropBounds(x, y, width, height, angle = 0) {
  const corners = cropCorners(x, y, width, height, angle);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of corners) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function normalizeBounds(boundsOrWidth, height) {
  if (boundsOrWidth && typeof boundsOrWidth === "object") {
    const minX = finiteNumber(boundsOrWidth.minX ?? boundsOrWidth.x);
    const minY = finiteNumber(boundsOrWidth.minY ?? boundsOrWidth.y);
    const maxX = finiteNumber(
      boundsOrWidth.maxX,
      minX + Math.max(0, finiteNumber(boundsOrWidth.width)),
    );
    const maxY = finiteNumber(
      boundsOrWidth.maxY,
      minY + Math.max(0, finiteNumber(boundsOrWidth.height)),
    );
    return {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
    };
  }
  const width = Math.max(1, finiteNumber(boundsOrWidth, 1));
  const normalizedHeight = Math.max(1, finiteNumber(height, 1));
  return { minX: 0, minY: 0, maxX: width, maxY: normalizedHeight };
}

/** Source-pixel coordinates covered by the entire preview canvas, including letterboxing. */
export function canvasSourceBounds(canvasWidth, canvasHeight, imageLayout = {}) {
  const scale = finiteNumber(imageLayout?.scale);
  if (!(scale > 0)) return null;
  const width = Math.max(0, finiteNumber(canvasWidth));
  const height = Math.max(0, finiteNumber(canvasHeight));
  const left = finiteNumber(imageLayout?.left);
  const top = finiteNumber(imageLayout?.top);
  return normalizeBounds({
    minX: -left / scale || 0,
    minY: -top / scale || 0,
    maxX: (width - left) / scale,
    maxY: (height - top) / scale,
  });
}

export function cropFitsBounds(crop, bounds, angleDegrees = crop?.angle) {
  if (!bounds) return true;
  const limit = normalizeBounds(bounds);
  const box = rotatedCropBounds(
    crop?.x,
    crop?.y,
    crop?.width,
    crop?.height,
    angleDegrees,
  );
  const epsilon = 1e-7;
  return box.minX >= limit.minX - epsilon
    && box.minY >= limit.minY - epsilon
    && box.maxX <= limit.maxX + epsilon
    && box.maxY <= limit.maxY + epsilon;
}

/**
 * Fit and translate a crop so every rotated corner remains on the preview canvas.
 * The crop keeps its aspect ratio if it is too large for the available canvas.
 */
export function constrainCropRect(crop, bounds, angleDegrees = crop?.angle) {
  const limit = normalizeBounds(bounds);
  const boundWidth = Math.max(1, limit.maxX - limit.minX);
  const boundHeight = Math.max(1, limit.maxY - limit.minY);
  const angle = finiteNumber(angleDegrees);
  let width = Math.max(1, Math.min(MAX_IMAGE_SIDE, finiteNumber(crop?.width, 1)));
  let height = Math.max(1, Math.min(MAX_IMAGE_SIDE, finiteNumber(crop?.height, 1)));
  let centerX = finiteNumber(crop?.x) + width / 2;
  let centerY = finiteNumber(crop?.y) + height / 2;
  let box = rotatedCropBounds(centerX - width / 2, centerY - height / 2, width, height, angle);
  const scale = Math.min(1, boundWidth / Math.max(1e-9, box.width), boundHeight / Math.max(1e-9, box.height));
  width = Math.max(1, width * scale);
  height = Math.max(1, height * scale);
  box = rotatedCropBounds(centerX - width / 2, centerY - height / 2, width, height, angle);
  centerX = clamp(centerX, limit.minX + box.width / 2, limit.maxX - box.width / 2);
  centerY = clamp(centerY, limit.minY + box.height / 2, limit.maxY - box.height / 2);
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    angle,
  };
}

/**
 * Normalize crop values for rendering. Position intentionally remains unrestricted:
 * a crop may include the preview canvas area outside the source image.
 */
export function sanitizeCropRect(sourceWidth, sourceHeight, crop = {}, angleDegrees = 0) {
  const sw = Math.max(1, Math.trunc(finiteNumber(sourceWidth, 1)));
  const sh = Math.max(1, Math.trunc(finiteNumber(sourceHeight, 1)));
  const width = Math.max(1, Math.min(MAX_IMAGE_SIDE, Math.round(finiteNumber(crop?.width, sw))));
  const height = Math.max(1, Math.min(MAX_IMAGE_SIDE, Math.round(finiteNumber(crop?.height, sh))));
  return {
    x: Math.round(finiteNumber(crop?.x)),
    y: Math.round(finiteNumber(crop?.y)),
    width,
    height,
    angle: finiteNumber(angleDegrees),
  };
}

/**
 * Translate a crop without changing local width/height/angle, constrained by
 * the supplied canvas bounds. Numeric width/height keep the legacy 0..size form.
 */
export function moveCropRect(origin, dx, dy, boundsOrWidth, boundsHeight) {
  const limit = normalizeBounds(boundsOrWidth, boundsHeight);
  const fitted = constrainCropRect(origin, limit, origin?.angle);
  const box = rotatedCropBounds(fitted.x, fitted.y, fitted.width, fitted.height, fitted.angle);
  const moveX = clamp(finiteNumber(dx), limit.minX - box.minX, limit.maxX - box.maxX);
  const moveY = clamp(finiteNumber(dy), limit.minY - box.minY, limit.maxY - box.maxY);
  return {
    ...fitted,
    x: fitted.x + moveX,
    y: fitted.y + moveY,
  };
}

/**
 * Resize along the crop's rotated local axes.
 * Width/height are not limited by the image; optional preview-canvas bounds
 * stop the dragged edge while preserving the opposite edge/corner.
 */
export function resizeCropRect(origin, mode, localX, localY, boundsOrWidth = null, boundsHeight = null) {
  const width = Math.max(1, Math.min(MAX_IMAGE_SIDE, finiteNumber(origin?.width, 1)));
  const height = Math.max(1, Math.min(MAX_IMAGE_SIDE, finiteNumber(origin?.height, 1)));
  const angle = finiteNumber(origin?.angle);
  const centerX = finiteNumber(origin?.x) + width / 2;
  const centerY = finiteNumber(origin?.y) + height / 2;
  const handle = String(mode || "");
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  let nextWidth = width;
  let nextHeight = height;
  let shiftX = 0;
  let shiftY = 0;
  const lx = finiteNumber(localX);
  const ly = finiteNumber(localY);

  // Cap size first, then shift from the capped size so the opposite edge stays fixed.
  if (west) {
    nextWidth = Math.max(1, Math.min(MAX_IMAGE_SIDE, halfWidth - lx));
    shiftX = halfWidth - nextWidth / 2;
  }
  if (east) {
    nextWidth = Math.max(1, Math.min(MAX_IMAGE_SIDE, lx + halfWidth));
    shiftX = nextWidth / 2 - halfWidth;
  }
  if (north) {
    nextHeight = Math.max(1, Math.min(MAX_IMAGE_SIDE, halfHeight - ly));
    shiftY = halfHeight - nextHeight / 2;
  }
  if (south) {
    nextHeight = Math.max(1, Math.min(MAX_IMAGE_SIDE, ly + halfHeight));
    shiftY = nextHeight / 2 - halfHeight;
  }

  // Shift the center along the rotated local axes (not image-aligned X/Y).
  const shiftedCenter = rotatePoint(
    { x: centerX + shiftX, y: centerY + shiftY },
    centerX,
    centerY,
    angle,
  );

  const fittedWidth = Math.max(1, Math.min(MAX_IMAGE_SIDE, nextWidth));
  const fittedHeight = Math.max(1, Math.min(MAX_IMAGE_SIDE, nextHeight));
  // Keep subpixel x/y during interaction; callers normalize on commit.
  const candidate = {
    x: shiftedCenter.x - fittedWidth / 2,
    y: shiftedCenter.y - fittedHeight / 2,
    width: fittedWidth,
    height: fittedHeight,
    angle,
  };
  if (boundsOrWidth == null) return candidate;
  const bounds = normalizeBounds(boundsOrWidth, boundsHeight);
  if (cropFitsBounds(candidate, bounds, angle)) return candidate;

  // Walk the dragged handle back to its original position. This preserves the
  // opposite edge/corner instead of translating the whole crop at the boundary.
  const startX = east ? halfWidth : west ? -halfWidth : lx;
  const startY = south ? halfHeight : north ? -halfHeight : ly;
  let low = 0;
  let high = 1;
  let best = { x: finiteNumber(origin?.x), y: finiteNumber(origin?.y), width, height, angle };
  if (!cropFitsBounds(best, bounds, angle)) return constrainCropRect(candidate, bounds, angle);
  for (let iteration = 0; iteration < 36; iteration += 1) {
    const progress = (low + high) / 2;
    const next = resizeCropRect(
      origin,
      mode,
      startX + (lx - startX) * progress,
      startY + (ly - startY) * progress,
    );
    if (cropFitsBounds(next, bounds, angle)) {
      low = progress;
      best = next;
    } else {
      high = progress;
    }
  }
  return best;
}

export function pointInCrop(point, x, y, width, height, angle = 0) {
  const w = Math.max(1, finiteNumber(width, 1));
  const h = Math.max(1, finiteNumber(height, 1));
  const left = finiteNumber(x);
  const top = finiteNumber(y);
  const local = rotatePoint(point, left + w / 2, top + h / 2, -finiteNumber(angle));
  return local.x >= left && local.x <= left + w && local.y >= top && local.y <= top + h;
}

/** Resolve crop interaction from geometry rather than the event's DOM target. */
export function resolveCropDragMode(point, crop, handle = "") {
  if (handle) return String(handle);
  return pointInCrop(
    point,
    crop?.x,
    crop?.y,
    crop?.width,
    crop?.height,
    crop?.angle,
  ) ? "move" : "new";
}

/**
 * Content box of an object-fit:contain image inside a container (stage coords).
 * Guarantees a single isotropic scale.
 */
export function objectFitContainRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
  const cw = Math.max(0, finiteNumber(containerWidth));
  const ch = Math.max(0, finiteNumber(containerHeight));
  const sw = Math.max(1, finiteNumber(sourceWidth, 1));
  const sh = Math.max(1, finiteNumber(sourceHeight, 1));
  if (!cw || !ch) return { left: 0, top: 0, width: 0, height: 0, scale: 0 };
  const scale = Math.min(cw / sw, ch / sh);
  const width = sw * scale;
  const height = sh * scale;
  return {
    left: (cw - width) / 2,
    top: (ch - height) / 2,
    width,
    height,
    scale,
  };
}

/**
 * Project a source-image point through a rotated crop into upright target pixels.
 * Order: translate to crop center → un-rotate along the tilted crop axes →
 * non-uniform scale → target center. Scaling before un-rotation shears.
 */
export function mapRotatedCropToTarget(point, crop, target, angleDegrees = 0) {
  const width = Math.max(1, finiteNumber(crop?.width, 1));
  const height = Math.max(1, finiteNumber(crop?.height, 1));
  const cx = finiteNumber(crop?.x) + width / 2;
  const cy = finiteNumber(crop?.y) + height / 2;
  const tw = Math.max(1, finiteNumber(target?.width, 1));
  const th = Math.max(1, finiteNumber(target?.height, 1));
  const aligned = rotatePoint(point, cx, cy, -finiteNumber(angleDegrees));
  return {
    x: (aligned.x - cx) * (tw / width) + tw / 2,
    y: (aligned.y - cy) * (th / height) + th / 2,
  };
}
