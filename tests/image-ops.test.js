import test from "node:test";
import assert from "node:assert/strict";
import {
  fitDimension,
  formatInfo,
  normalizeCrop,
  normalizeAngle,
  normalizeOutputSize,
  normalizeRotation,
  rotatedSize,
  watermarkCoordinates,
} from "../src/lib/imageOps.js";

test("normalizes crop coordinates inside the source image", () => {
  assert.deepEqual(normalizeCrop(800, 600, { x: -4, y: 700, width: 900, height: 80 }), {
    x: 0, y: 599, width: 800, height: 1,
  });
  assert.deepEqual(normalizeCrop(800, 600, {}), { x: 0, y: 0, width: 800, height: 600 });
});

test("keeps resize output within browser-safe limits", () => {
  assert.deepEqual(normalizeOutputSize(6000, 6000), { width: 6000, height: 6000 });
  assert.throws(() => normalizeOutputSize(12000, 12001), /40 megapixels/);
  assert.deepEqual(rotatedSize(640, 480, 90), { width: 480, height: 640 });
});

test("supports aspect-locked resize and quarter-turn rotation", () => {
  assert.equal(fitDimension(1000, 2000, 1000), 500);
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(44), 0);
  assert.equal(normalizeRotation(46), 90);
});

test("supports arbitrary crop angles", () => {
  assert.equal(normalizeAngle(-15), 345);
});

test("places watermark text with a safe canvas margin", () => {
  assert.deepEqual(watermarkCoordinates(800, 600, 120, 32, "bottom-right", 18), { x: 662, y: 582 });
  assert.deepEqual(watermarkCoordinates(80, 60, 200, 32, "top-left", 18), { x: 18, y: 50 });
});

test("maps output MIME types to stable file extensions", () => {
  assert.deepEqual(formatInfo("image/jpeg"), { extension: "jpg", label: "JPEG" });
  assert.deepEqual(formatInfo("image/webp"), { extension: "webp", label: "WebP" });
  assert.deepEqual(formatInfo("image/unknown"), { extension: "png", label: "PNG" });
});
