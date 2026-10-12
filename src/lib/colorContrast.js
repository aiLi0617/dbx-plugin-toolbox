import { clampByte, hslToRgb, rgbToHsl } from "./tools/convert.js";

function clampAlpha(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

export function parseRgbaColor(value) {
  const raw = String(value ?? "").trim();
  const hex = raw.replace(/^#/, "");
  if (/^[\da-f]{3,4}$/i.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
      a: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1,
    };
  }
  if (/^[\da-f]{6}([\da-f]{2})?$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const functional = raw.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/i);
  if (functional) {
    const channels = functional.slice(1, 4).map(Number);
    if (channels.some((channel) => channel > 255)) return null;
    const alpha = parseAlpha(functional[4]);
    if (alpha == null) return null;
    return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
  }

  const hsl = raw.match(/^hsla?\(\s*(-?\d*\.?\d+)(?:deg)?\s*[, ]\s*(\d*\.?\d+)%\s*[, ]\s*(\d*\.?\d+)%(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/i);
  if (!hsl) return null;
  const hue = Number(hsl[1]);
  const saturation = Number(hsl[2]);
  const lightness = Number(hsl[3]);
  const alpha = parseAlpha(hsl[4]);
  if (![hue, saturation, lightness].every(Number.isFinite) || saturation > 100 || lightness > 100 || alpha == null) return null;
  return { ...hslToRgb(hue, saturation / 100, lightness / 100), a: alpha };
}

function parseAlpha(value) {
  if (value == null) return 1;
  const alpha = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1 ? alpha : null;
}

export function formatRgbaHex(color, alwaysAlpha = false) {
  const alpha = clampAlpha(color?.a ?? 1);
  const body = [color?.r, color?.g, color?.b]
    .map((channel) => clampByte(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  if (!alwaysAlpha && alpha >= 1) return `#${body}`;
  return `#${body}${Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase()}`;
}

export function formatRgbaCss(color) {
  const alpha = clampAlpha(color?.a ?? 1);
  if (alpha >= 1) return `rgb(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)})`;
  return `rgba(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)}, ${Number(alpha.toFixed(3))})`;
}

export function formatHslaCss(color) {
  const hsl = rgbToHsl(color?.r, color?.g, color?.b);
  const hue = Math.round(hsl.h);
  const saturation = Math.round(hsl.s * 100);
  const lightness = Math.round(hsl.l * 100);
  const alpha = clampAlpha(color?.a ?? 1);
  if (alpha >= 1) return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${Number(alpha.toFixed(3))})`;
}

export function formatColorValue(color, format = "hex") {
  if (!color) return "";
  if (format === "rgb") return formatRgbaCss(color);
  if (format === "hsl") return formatHslaCss(color);
  return formatRgbaHex(color);
}

export function formatEditableColorValue(color, format = "hex") {
  const formatted = formatColorValue(color, format);
  return format === "hex" ? formatted.slice(1) : formatted;
}

export function compositeColors(foreground, background) {
  const foregroundAlpha = clampAlpha(foreground?.a ?? 1);
  const backgroundAlpha = clampAlpha(background?.a ?? 1);
  const alpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (key) => (
    clampByte((foreground[key] * foregroundAlpha + background[key] * backgroundAlpha * (1 - foregroundAlpha)) / alpha)
  );
  return { r: channel("r"), g: channel("g"), b: channel("b"), a: alpha };
}

export function resolveContrastPair(foreground, background, canvas = { r: 255, g: 255, b: 255, a: 1 }) {
  const opaqueCanvas = { ...canvas, a: 1 };
  const resolvedBackground = compositeColors(background, opaqueCanvas);
  const resolvedForeground = compositeColors(foreground, resolvedBackground);
  return { foreground: resolvedForeground, background: resolvedBackground };
}

export function effectiveContrastRatio(foreground, background, canvas) {
  const resolved = resolveContrastPair(foreground, background, canvas);
  return contrastRatio(resolved.foreground, resolved.background);
}

function linearizeChannel(value) {
  const channel = clampByte(value) / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  if (!color) return 0;
  return (
    0.2126 * linearizeChannel(color.r) +
    0.7152 * linearizeChannel(color.g) +
    0.0722 * linearizeChannel(color.b)
  );
}

export function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function evaluateWcagContrast(foreground, background) {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    normalAa: ratio >= 4.5,
    normalAaa: ratio >= 7,
    largeAa: ratio >= 3,
    largeAaa: ratio >= 4.5,
    nonTextAa: ratio >= 3,
  };
}

export function evaluateEffectiveWcagContrast(foreground, background, canvas) {
  const resolved = resolveContrastPair(foreground, background, canvas);
  return {
    ...evaluateWcagContrast(resolved.foreground, resolved.background),
    resolvedForeground: resolved.foreground,
    resolvedBackground: resolved.background,
  };
}

function mixColor(from, to, amount) {
  return {
    r: clampByte(from.r + (to.r - from.r) * amount),
    g: clampByte(from.g + (to.g - from.g) * amount),
    b: clampByte(from.b + (to.b - from.b) * amount),
  };
}

function colorDistanceSquared(left, right) {
  return (
    (left.r - right.r) ** 2 +
    (left.g - right.g) ** 2 +
    (left.b - right.b) ** 2
  );
}

function findEndpointAdjustment(foreground, background, endpoint, targetRatio) {
  if (contrastRatio(endpoint, background) < targetRatio) return null;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixColor(foreground, endpoint, middle), background) >= targetRatio) {
      high = middle;
    } else {
      low = middle;
    }
  }
  const color = mixColor(foreground, endpoint, high);
  return {
    color,
    ratio: contrastRatio(color, background),
    amount: high,
    distance: colorDistanceSquared(color, foreground),
  };
}

export function suggestForegroundColor(foreground, background, targetRatio) {
  const target = Number(targetRatio);
  if (!Number.isFinite(target) || target < 1 || target > 21) return null;
  const currentRatio = contrastRatio(foreground, background);
  if (currentRatio >= target) {
    return { color: { ...foreground }, ratio: currentRatio, amount: 0, changed: false };
  }
  const candidates = [
    findEndpointAdjustment(foreground, background, { r: 0, g: 0, b: 0 }, target),
    findEndpointAdjustment(foreground, background, { r: 255, g: 255, b: 255 }, target),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((left, right) => left.distance - right.distance || left.amount - right.amount);
  const best = candidates[0];
  return { color: best.color, ratio: best.ratio, amount: best.amount, changed: true };
}

export function bestMonochromeForeground(background) {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const blackRatio = contrastRatio(black, background);
  const whiteRatio = contrastRatio(white, background);
  return blackRatio >= whiteRatio
    ? { color: black, ratio: blackRatio, name: "black" }
    : { color: white, ratio: whiteRatio, name: "white" };
}

export function bestMonochromeContrastColor(foreground, background, role = "foreground", canvas) {
  if (role !== "foreground" && role !== "background") return null;
  const source = role === "background" ? background : foreground;
  const alpha = clampAlpha(source?.a ?? 1);
  const candidates = [
    { color: { r: 0, g: 0, b: 0, a: alpha }, name: "black" },
    { color: { r: 255, g: 255, b: 255, a: alpha }, name: "white" },
  ].map((candidate) => ({
    ...candidate,
    ratio: role === "background"
      ? effectiveContrastRatio(foreground, candidate.color, canvas)
      : effectiveContrastRatio(candidate.color, background, canvas),
  }));
  return candidates[0].ratio >= candidates[1].ratio ? candidates[0] : candidates[1];
}

function withRgb(color, rgb) {
  return { ...rgb, a: clampAlpha(color?.a ?? 1) };
}

function findLayerAdjustment(foreground, background, canvas, role, endpoint, targetRatio) {
  const source = role === "background" ? background : foreground;
  const candidateAt = (amount) => withRgb(source, mixColor(source, endpoint, amount));
  const ratioAt = (candidate) => role === "background"
    ? effectiveContrastRatio(foreground, candidate, canvas)
    : effectiveContrastRatio(candidate, background, canvas);
  if (ratioAt(candidateAt(1)) < targetRatio) return null;
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const middle = (low + high) / 2;
    if (ratioAt(candidateAt(middle)) >= targetRatio) high = middle;
    else low = middle;
  }
  const color = candidateAt(high);
  return {
    color,
    ratio: ratioAt(color),
    amount: high,
    distance: colorDistanceSquared(color, source),
  };
}

export function suggestContrastColor(foreground, background, targetRatio, role = "foreground", canvas) {
  const target = Number(targetRatio);
  if (!Number.isFinite(target) || target < 1 || target > 21) return null;
  if (role !== "foreground" && role !== "background") return null;
  const currentRatio = effectiveContrastRatio(foreground, background, canvas);
  const source = role === "background" ? background : foreground;
  if (currentRatio >= target) {
    return { color: { ...source }, ratio: currentRatio, amount: 0, changed: false };
  }
  const candidates = [
    findLayerAdjustment(foreground, background, canvas, role, { r: 0, g: 0, b: 0 }, target),
    findLayerAdjustment(foreground, background, canvas, role, { r: 255, g: 255, b: 255 }, target),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((left, right) => left.distance - right.distance || left.amount - right.amount);
  const best = candidates[0];
  return { color: best.color, ratio: best.ratio, amount: best.amount, changed: true };
}

export function isLargeText(size, unit = "px", weight = 400, rootPx = 16) {
  const numericSize = Number(size);
  const numericWeight = Number(weight);
  if (!Number.isFinite(numericSize) || numericSize <= 0) return false;
  let px = numericSize;
  if (unit === "pt") px = numericSize * (4 / 3);
  else if (unit === "rem") px = numericSize * Number(rootPx || 16);
  const bold = numericWeight >= 700;
  return bold ? px >= 14 * (4 / 3) : px >= 18 * (4 / 3);
}
