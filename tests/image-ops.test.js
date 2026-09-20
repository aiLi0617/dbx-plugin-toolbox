import test from "node:test";
import assert from "node:assert/strict";
import {
  canvasSourceBounds,
  constrainCropRect,
  cropCorners,
  cropFitsBounds,
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
  resolveCropDragMode,
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

test("dragging inside a crop moves it and only outside starts a new selection", () => {
  const crop = { x: 100, y: 80, width: 240, height: 120, angle: 30 };
  assert.equal(resolveCropDragMode({ x: 220, y: 140 }, crop), "move");
  assert.equal(resolveCropDragMode({ x: 20, y: 20 }, crop), "new");
  assert.equal(resolveCropDragMode({ x: 220, y: 140 }, crop, "se"), "se");
});

test("moving a rotated crop keeps local size inside canvas bounds", () => {
  const origin = { x: 200, y: 150, width: 240, height: 160, angle: 15 };
  const moved = moveCropRect(origin, 40, -30, 800, 600);
  assert.equal(moved.width, 240);
  assert.equal(moved.height, 160);
  assert.equal(moved.angle, 15);
  assert.equal(moved.x, 240);
  assert.equal(moved.y, 120);
  assert.equal(cropFitsBounds(moved, { minX: 0, minY: 0, maxX: 800, maxY: 600 }), true);
});

test("crop movement can use canvas space outside the source image", () => {
  const origin = { x: 10, y: 10, width: 200, height: 120, angle: 45 };
  const canvas = { minX: -120, minY: -90, maxX: 920, maxY: 690 };
  const moved = moveCropRect(origin, -100, -100, canvas);
  assert.equal(moved.width, 200);
  assert.equal(moved.height, 120);
  assert.equal(moved.angle, 45);
  assert.ok(moved.x < 0);
  assert.ok(moved.y < 0);
  assert.equal(cropFitsBounds(moved, canvas), true);
});

test("crop size can exceed image dimensions up to the canvas edge", () => {
  const canvas = { minX: -200, minY: -150, maxX: 1000, maxY: 750 };
  const origin = { x: 100, y: 100, width: 100, height: 80, angle: 0 };
  const wide = resizeCropRect(origin, "e", 2000, 0, canvas);
  assert.ok(Math.abs(wide.width - 900) < 1e-6);
  assert.ok(wide.width > 800);
  assert.equal(wide.height, 80);
  assert.equal(wide.angle, 0);
  assert.equal(cropFitsBounds(wide, canvas), true);
  const tall = resizeCropRect(origin, "s", 0, 1500, canvas);
  assert.equal(tall.width, 100);
  assert.ok(Math.abs(tall.height - 650) < 1e-6);
  assert.ok(tall.height > 600);
  assert.equal(cropFitsBounds(tall, canvas), true);
});

test("resize keeps the opposite edge fixed while using the full canvas", () => {
  const canvas = { minX: -200, minY: -150, maxX: 1000, maxY: 750 };
  const origin = { x: 200, y: 150, width: 120, height: 80, angle: 0 };
  const fromWest = resizeCropRect(origin, "w", -400, 0, canvas);
  assert.equal(fromWest.width, 460);
  assert.equal(fromWest.x + fromWest.width, origin.x + origin.width);
  const fromEast = resizeCropRect(origin, "e", 400, 0, canvas);
  assert.equal(fromEast.width, 460);
  assert.equal(fromEast.x, origin.x);
  const fromNorth = resizeCropRect(origin, "n", 0, -300, canvas);
  assert.equal(fromNorth.height, 340);
  assert.equal(fromNorth.y + fromNorth.height, origin.y + origin.height);
  const fromSouth = resizeCropRect(origin, "s", 0, 300, canvas);
  assert.equal(fromSouth.height, 340);
  assert.equal(fromSouth.y, origin.y);
});

test("rotated resize beyond the image keeps its opposite edge fixed on canvas", () => {
  const canvas = { minX: -300, minY: -300, maxX: 1100, maxY: 900 };
  const origin = { x: 200, y: 150, width: 100, height: 80, angle: 37 };
  const centerX = origin.x + origin.width / 2;
  const centerY = origin.y + origin.height / 2;
  const halfW = origin.width / 2;
  const oldEast = rotatePoint({ x: centerX + halfW, y: centerY }, centerX, centerY, origin.angle);
  const next = resizeCropRect(origin, "w", -400, 0, canvas);
  assert.equal(next.width, 450);
  assert.equal(next.height, origin.height);
  assert.equal(next.angle, origin.angle);
  const ncx = next.x + next.width / 2;
  const ncy = next.y + next.height / 2;
  const newEast = rotatePoint({ x: ncx + next.width / 2, y: ncy }, ncx, ncy, next.angle);
  assert.ok(Math.abs(newEast.x - oldEast.x) < 1);
  assert.ok(Math.abs(newEast.y - oldEast.y) < 1);
  assert.equal(cropFitsBounds(next, canvas), true);
});

test("sanitize preserves crop positions outside the source image", () => {
  const next = sanitizeCropRect(100, 100, { x: -120, y: 130, width: 150, height: 80 }, 37);
  assert.equal(next.width, 150);
  assert.equal(next.height, 80);
  assert.equal(next.x, -120);
  assert.equal(next.y, 130);
  assert.equal(next.angle, 37);
});

test("object-fit contain uses a single isotropic scale", () => {
  const box = objectFitContainRect(400, 300, 800, 400);
  assert.equal(box.scale, 0.5);
  assert.equal(box.width, 400);
  assert.equal(box.height, 200);
  assert.equal(box.left, 0);
  assert.equal(box.top, 50);
});

test("maps letterboxed preview canvas into source-pixel coordinates", () => {
  const layout = objectFitContainRect(400, 300, 800, 400);
  assert.deepEqual(canvasSourceBounds(400, 300, layout), {
    minX: 0,
    minY: -100,
    maxX: 800,
    maxY: 500,
  });
});

test("constrains every rotated crop corner to the canvas", () => {
  const canvas = { minX: -100, minY: -80, maxX: 900, maxY: 680 };
  const next = constrainCropRect(
    { x: -300, y: -200, width: 1200, height: 700, angle: 45 },
    canvas,
    45,
  );
  assert.equal(cropFitsBounds(next, canvas, 45), true);
  assert.ok(next.width < 1200);
  assert.ok(next.x < 0);
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
