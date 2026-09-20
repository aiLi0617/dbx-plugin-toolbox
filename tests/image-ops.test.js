import test from "node:test";
import assert from "node:assert/strict";
import {
  cropCorners,
  fitDimension,
  formatInfo,
  mapRotatedCropToTarget,
  moveCropRect,
  normalizeCrop,
  normalizeAngle,
  normalizeOutputSize,
  normalizeRotation,
  objectFitContainRect,
  resizeCropRect,
  rotatedCropBounds,
  rotatedSize,
  rotatePoint,
  sanitizeCropRect,
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
  assert.deepEqual(formatInfo("image/gif"), { extension: "gif", label: "GIF" });
  assert.deepEqual(formatInfo("image/bmp"), { extension: "bmp", label: "BMP" });
  assert.deepEqual(formatInfo("image/avif"), { extension: "avif", label: "AVIF" });
  assert.deepEqual(formatInfo("image/unknown"), { extension: "png", label: "PNG" });
});

test("rotates crop corners in source space without skewing", () => {
  const corners = cropCorners(100, 50, 200, 100, 90);
  assert.equal(corners.length, 4);
  const bounds = rotatedCropBounds(100, 50, 200, 100, 90);
  assert.ok(Math.abs(bounds.width - 100) < 1e-6);
  assert.ok(Math.abs(bounds.height - 200) < 1e-6);
  const around = rotatePoint({ x: 200, y: 50 }, 200, 100, 90);
  assert.ok(Math.abs(around.x - 250) < 1e-6);
  assert.ok(Math.abs(around.y - 100) < 1e-6);
});

test("moving a rotated crop keeps local size and clamps by canvas center", () => {
  const origin = { x: 200, y: 150, width: 240, height: 160, angle: 15 };
  const moved = moveCropRect(origin, 40, -30, 800, 600);
  assert.equal(moved.width, 240);
  assert.equal(moved.height, 160);
  assert.equal(moved.angle, 15);
  assert.equal(moved.x, 240);
  assert.equal(moved.y, 120);
});

test("rotated crop may overhang canvas while keeping canvas-sized local bounds", () => {
  const origin = { x: 10, y: 10, width: 200, height: 120, angle: 45 };
  const moved = moveCropRect(origin, -100, -100, 800, 600);
  assert.equal(moved.width, 200);
  assert.equal(moved.height, 120);
  assert.equal(moved.angle, 45);
  const cx = moved.x + moved.width / 2;
  const cy = moved.y + moved.height / 2;
  assert.ok(cx >= 0 && cx <= 800);
  assert.ok(cy >= 0 && cy <= 600);
});

test("crop size can exceed image dimensions", () => {
  const origin = { x: 100, y: 100, width: 100, height: 80, angle: 45 };
  const wide = resizeCropRect(origin, "e", 2000, 0, 800, 600);
  assert.equal(wide.width, 2050);
  assert.ok(wide.width > 800);
  assert.equal(wide.height, 80);
  assert.equal(wide.angle, 45);
  const tall = resizeCropRect(origin, "s", 0, 1500, 800, 600);
  assert.equal(tall.width, 100);
  assert.equal(tall.height, 1540);
  assert.ok(tall.height > 600);
});

test("resize keeps the opposite edge fixed beyond image size", () => {
  const origin = { x: 200, y: 150, width: 120, height: 80, angle: 0 };
  const fromWest = resizeCropRect(origin, "w", -400, 0, 800, 600);
  assert.equal(fromWest.width, 460);
  assert.equal(fromWest.x + fromWest.width, origin.x + origin.width);
  const fromEast = resizeCropRect(origin, "e", 400, 0, 800, 600);
  assert.equal(fromEast.width, 460);
  assert.equal(fromEast.x, origin.x);
  const fromNorth = resizeCropRect(origin, "n", 0, -300, 800, 600);
  assert.equal(fromNorth.height, 340);
  assert.equal(fromNorth.y + fromNorth.height, origin.y + origin.height);
  const fromSouth = resizeCropRect(origin, "s", 0, 300, 800, 600);
  assert.equal(fromSouth.height, 340);
  assert.equal(fromSouth.y, origin.y);
});

test("rotated west resize beyond image keeps local east edge fixed", () => {
  const origin = { x: 200, y: 150, width: 100, height: 80, angle: 37 };
  const centerX = origin.x + origin.width / 2;
  const centerY = origin.y + origin.height / 2;
  const halfW = origin.width / 2;
  const oldEast = rotatePoint({ x: centerX + halfW, y: centerY }, centerX, centerY, origin.angle);
  const next = resizeCropRect(origin, "w", -400, 0, 800, 600);
  assert.equal(next.width, 450);
  assert.equal(next.height, origin.height);
  assert.equal(next.angle, origin.angle);
  const ncx = next.x + next.width / 2;
  const ncy = next.y + next.height / 2;
  const newEast = rotatePoint({ x: ncx + next.width / 2, y: ncy }, ncx, ncy, next.angle);
  assert.ok(Math.abs(newEast.x - oldEast.x) < 1);
  assert.ok(Math.abs(newEast.y - oldEast.y) < 1);
});

test("sanitize allows size beyond image while keeping center on image", () => {
  const next = sanitizeCropRect(100, 100, { x: -20, y: -10, width: 150, height: 80 }, 37);
  assert.equal(next.width, 150);
  assert.equal(next.height, 80);
  // Original center x = -20 + 75 = 55; stays on image.
  assert.equal(next.x + next.width / 2, 55);
  assert.ok(next.y + next.height / 2 >= 0);
  assert.ok(next.y + next.height / 2 <= 100);
});

test("object-fit contain uses a single isotropic scale", () => {
  const box = objectFitContainRect(400, 300, 800, 400);
  assert.equal(box.scale, 0.5);
  assert.equal(box.width, 400);
  assert.equal(box.height, 200);
  assert.equal(box.left, 0);
  assert.equal(box.top, 50);
});

test("rotated crop sampling maps tilted-axis corners to upright target corners", () => {
  const crop = { x: 10, y: 19, width: 82, height: 58 };
  const target = { width: 100, height: 100 };
  const angle = 37;
  const corners = cropCorners(crop.x, crop.y, crop.width, crop.height, angle);
  const mapped = corners.map((point) => mapRotatedCropToTarget(point, crop, target, angle));
  assert.ok(Math.hypot(mapped[0].x - 0, mapped[0].y - 0) < 1e-6);
  assert.ok(Math.hypot(mapped[1].x - 100, mapped[1].y - 0) < 1e-6);
  assert.ok(Math.hypot(mapped[2].x - 100, mapped[2].y - 100) < 1e-6);
  assert.ok(Math.hypot(mapped[3].x - 0, mapped[3].y - 100) < 1e-6);
});
