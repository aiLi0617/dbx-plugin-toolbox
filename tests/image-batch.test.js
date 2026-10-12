import test from "node:test";
import assert from "node:assert/strict";
import { createTaskGate, imageDrawRect, normalizeOcrRectangle, ocrSelectionFromDisplay, reorderList, validateCanvasSize, validateImageFiles } from "../src/lib/imageBatch.js";

function image(name, size, type = "image/png") {
  return { name, size, type };
}

test("image batches enforce count, type, per-file, and total limits", () => {
  assert.equal(validateImageFiles([image("a.png", 10), image("b.png", 20)], { min: 2 }).length, 2);
  assert.throws(() => validateImageFiles([image("a.png", 10)], { min: 2 }), (error) => error.code === "IMAGE_COUNT_MIN");
  assert.throws(() => validateImageFiles([image("a.txt", 10, "text/plain")]), (error) => error.code === "IMAGE_TYPE");
  assert.throws(() => validateImageFiles([image("a.png", 31)], { maxFileBytes: 30 }), (error) => error.code === "IMAGE_FILE_SIZE");
  assert.throws(() => validateImageFiles([image("a.png", 20), image("b.png", 20)], { maxTotalBytes: 30 }), (error) => error.code === "IMAGE_TOTAL_SIZE");
});

test("OCR regions must be finite, positive, and fully inside the image", () => {
  assert.deepEqual(normalizeOcrRectangle({ left: 10.8, top: 20.2, width: 100.9, height: 80.7 }, 640, 480), { left: 10, top: 20, width: 100, height: 80 });
  assert.throws(() => normalizeOcrRectangle({ left: 600, top: 0, width: 50, height: 20 }, 640, 480), (error) => error.code === "OCR_REGION_BOUNDS");
  assert.throws(() => normalizeOcrRectangle({ left: 0, top: 0, width: Number.NaN, height: 20 }, 640, 480), (error) => error.code === "OCR_REGION_NUMBER");
});

test("OCR drag selections map rendered image coordinates back to source pixels", () => {
  assert.deepEqual(ocrSelectionFromDisplay({ x: 150, y: 75 }, { x: 50, y: 25 }, 200, 100, 1000, 500), { left: 250, top: 125, width: 500, height: 250 });
  assert.deepEqual(ocrSelectionFromDisplay({ x: -20, y: -10 }, { x: 220, y: 110 }, 200, 100, 1000, 500), { left: 0, top: 0, width: 1000, height: 500 });
});

test("canvas limits, image fitting, and task cancellation are deterministic", () => {
  assert.deepEqual(validateCanvasSize(800, 600), { width: 800, height: 600, pixels: 480000 });
  assert.throws(() => validateCanvasSize(20000, 100), (error) => error.code === "CANVAS_SIZE");
  assert.deepEqual(imageDrawRect(400, 200, 200, 200, "contain"), { sx: 0, sy: 0, sw: 400, sh: 200, dx: 0, dy: 50, dw: 200, dh: 100 });
  assert.deepEqual(imageDrawRect(400, 200, 200, 200, "cover"), { sx: 100, sy: 0, sw: 200, sh: 200, dx: 0, dy: 0, dw: 200, dh: 200 });
  const gate = createTaskGate(); const first = gate.begin(); assert.equal(gate.isCurrent(first), true); gate.cancel(); assert.equal(gate.isCurrent(first), false);
});

test("image queues can be reordered before or after a drop target", () => {
  assert.deepEqual(reorderList(["a", "b", "c", "d"], 0, 2), ["b", "a", "c", "d"]);
  assert.deepEqual(reorderList(["a", "b", "c", "d"], 0, 2, true), ["b", "c", "a", "d"]);
  assert.deepEqual(reorderList(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(reorderList(["a", "b", "c"], 1, 1, true), ["a", "b", "c"]);
});
