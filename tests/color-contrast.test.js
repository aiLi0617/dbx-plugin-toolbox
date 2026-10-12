import assert from "node:assert/strict";
import test from "node:test";

import {
  bestMonochromeForeground,
  bestMonochromeContrastColor,
  compositeColors,
  contrastRatio,
  effectiveContrastRatio,
  evaluateWcagContrast,
  formatColorValue,
  formatEditableColorValue,
  formatHslaCss,
  formatRgbaCss,
  formatRgbaHex,
  isLargeText,
  parseRgbaColor,
  relativeLuminance,
  suggestContrastColor,
  suggestForegroundColor,
} from "../src/lib/colorContrast.js";

test("WCAG relative luminance uses linearized sRGB channels", () => {
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0 }), 0);
  assert.equal(relativeLuminance({ r: 255, g: 255, b: 255 }), 1);
  assert.ok(Math.abs(relativeLuminance({ r: 255, g: 0, b: 0 }) - 0.2126) < 1e-10);
});

test("WCAG contrast ratio is symmetric and reaches 21:1 for black and white", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  assert.equal(contrastRatio(black, white), 21);
  assert.equal(contrastRatio(white, black), 21);
  assert.equal(contrastRatio(white, white), 1);
});

test("WCAG conformance thresholds distinguish normal and large text", () => {
  const result = evaluateWcagContrast(
    { r: 118, g: 118, b: 118 },
    { r: 255, g: 255, b: 255 },
  );
  assert.ok(Math.abs(result.ratio - 4.542224959605253) < 1e-12);
  assert.deepEqual(
    {
      normalAa: result.normalAa,
      normalAaa: result.normalAaa,
      largeAa: result.largeAa,
      largeAaa: result.largeAaa,
    },
    { normalAa: true, normalAaa: false, largeAa: true, largeAaa: true },
  );
  assert.equal(result.nonTextAa, true);
});

test("foreground suggestions reach the requested ratio with the nearest black or white blend", () => {
  const foreground = { r: 255, g: 87, b: 51 };
  const background = { r: 255, g: 255, b: 255 };
  const aa = suggestForegroundColor(foreground, background, 4.5);
  const aaa = suggestForegroundColor(foreground, background, 7);
  assert.equal(aa.changed, true);
  assert.ok(aa.ratio >= 4.5);
  assert.ok(aaa.ratio >= 7);
  assert.ok(aaa.amount > aa.amount);
  assert.deepEqual(suggestForegroundColor({ r: 0, g: 0, b: 0 }, background, 7).changed, false);
});

test("foreground suggestions report unreachable targets and choose readable monochrome text", () => {
  const middleGray = { r: 119, g: 119, b: 119 };
  assert.equal(suggestForegroundColor(middleGray, middleGray, 7), null);
  assert.deepEqual(bestMonochromeForeground({ r: 255, g: 255, b: 255 }), {
    color: { r: 0, g: 0, b: 0 },
    ratio: 21,
    name: "black",
  });
  assert.equal(bestMonochromeForeground({ r: 0, g: 0, b: 0 }).name, "white");
});

test("RGBA parsing and formatting support short, eight-digit, numeric and percentage alpha", () => {
  assert.deepEqual(parseRgbaColor("#0f08"), { r: 0, g: 255, b: 0, a: 136 / 255 });
  assert.deepEqual(parseRgbaColor("33669980"), { r: 51, g: 102, b: 153, a: 128 / 255 });
  assert.deepEqual(parseRgbaColor("rgba(1, 2, 3, 50%)"), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseRgbaColor("hsl(210, 50%, 40%)"), { r: 51, g: 102, b: 153, a: 1 });
  assert.deepEqual(parseRgbaColor("hsla(0, 100%, 50%, 50%)"), { r: 255, g: 0, b: 0, a: 0.5 });
  assert.equal(parseRgbaColor("rgba(1, 2, 300, .5)"), null);
  assert.equal(formatRgbaHex({ r: 51, g: 102, b: 153, a: 0.5 }), "#33669980");
  assert.equal(formatRgbaCss({ r: 1, g: 2, b: 3, a: 0.5 }), "rgba(1, 2, 3, 0.5)");
  assert.equal(formatHslaCss({ r: 255, g: 0, b: 0, a: 0.5 }), "hsla(0, 100%, 50%, 0.5)");
  assert.equal(formatColorValue({ r: 51, g: 102, b: 153, a: 1 }, "hex"), "#336699");
  assert.equal(formatColorValue({ r: 51, g: 102, b: 153, a: 1 }, "rgb"), "rgb(51, 102, 153)");
  assert.equal(formatColorValue({ r: 51, g: 102, b: 153, a: 1 }, "hsl"), "hsl(210, 50%, 40%)");
  assert.equal(formatEditableColorValue({ r: 51, g: 102, b: 153, a: 1 }, "hex"), "336699");
  assert.equal(formatEditableColorValue({ r: 51, g: 102, b: 153, a: 1 }, "rgb"), "rgb(51, 102, 153)");
});

test("transparent colors are composited before contrast is evaluated", () => {
  assert.deepEqual(
    compositeColors({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }),
    { r: 128, g: 128, b: 128, a: 1 },
  );
  const ratio = effectiveContrastRatio(
    { r: 0, g: 0, b: 0, a: 0.5 },
    { r: 255, g: 255, b: 255, a: 0.5 },
    { r: 255, g: 255, b: 255, a: 1 },
  );
  assert.ok(Math.abs(ratio - contrastRatio({ r: 128, g: 128, b: 128 }, { r: 255, g: 255, b: 255 })) < 1e-12);
});

test("contrast suggestions can adjust either foreground or background while preserving alpha", () => {
  const foreground = { r: 130, g: 130, b: 130, a: 1 };
  const background = { r: 255, g: 255, b: 255, a: 1 };
  const canvas = { r: 255, g: 255, b: 255, a: 1 };
  const foregroundFix = suggestContrastColor(foreground, background, 4.5, "foreground", canvas);
  const backgroundFix = suggestContrastColor(foreground, background, 4.5, "background", canvas);
  assert.ok(foregroundFix.ratio >= 4.5);
  assert.ok(backgroundFix.ratio >= 4.5);
  assert.equal(backgroundFix.color.a, 1);
  assert.equal(
    suggestContrastColor(foreground, { ...background, a: 0.1 }, 7, "background", canvas),
    null,
  );
});

test("monochrome recommendations target the selected layer", () => {
  const foreground = { r: 255, g: 255, b: 255, a: 1 };
  const background = { r: 240, g: 240, b: 240, a: 1 };
  const canvas = { r: 255, g: 255, b: 255, a: 1 };
  const foregroundChoice = bestMonochromeContrastColor(foreground, background, "foreground", canvas);
  const backgroundChoice = bestMonochromeContrastColor(foreground, background, "background", canvas);
  assert.equal(foregroundChoice.name, "black");
  assert.equal(backgroundChoice.name, "black");
  assert.ok(foregroundChoice.ratio > 18);
  assert.equal(backgroundChoice.ratio, 21);
});

test("large text classification accounts for units and bold weight", () => {
  assert.equal(isLargeText(24, "px", 400), true);
  assert.equal(isLargeText(23.99, "px", 400), false);
  assert.equal(isLargeText(14, "pt", 700), true);
  assert.equal(isLargeText(18, "pt", 400), true);
  assert.equal(isLargeText(1.5, "rem", 400), true);
  assert.equal(isLargeText(1.1, "rem", 700), false);
});
