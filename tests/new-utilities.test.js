import test from "node:test";
import assert from "node:assert/strict";
import { bytesEqual, classifyMd5Comparison } from "../src/lib/collision.js";
import { extensionMatches, identifyFileType } from "../src/lib/fileType.js";
import { compressionRatio, dataUrlParts, gridSlices } from "../src/lib/imageUtility.js";

test("MD5 comparison only calls different bytes with equal digests a collision", () => {
  assert.equal(classifyMd5Comparison("same", "same", false), "collision");
  assert.equal(classifyMd5Comparison("same", "same", true), "identical");
  assert.equal(classifyMd5Comparison("left", "right", false), "different-hash");
  assert.equal(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
});

test("file type identification uses signatures and reports extension mismatches", () => {
  const png = identifyFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.mime, "image/png");
  assert.equal(extensionMatches(png, "photo.png"), true);
  assert.equal(extensionMatches(png, "photo.jpg"), false);
  assert.equal(identifyFileType(new TextEncoder().encode('{"ok":true}')).mime, "application/json");
});

test("grid slices cover odd dimensions without gaps", () => {
  const slices = gridSlices(10, 7, 2, 3);
  assert.equal(slices.length, 6);
  assert.equal(slices.filter((item) => item.row === 1).reduce((sum, item) => sum + item.width, 0), 10);
  assert.equal(slices.filter((item) => item.column === 1).reduce((sum, item) => sum + item.height, 0), 7);
  assert.deepEqual(slices.at(-1), { row: 2, column: 3, x: 7, y: 4, width: 3, height: 3 });
});

test("image utility helpers parse Data URLs and compare compression size", () => {
  assert.deepEqual(dataUrlParts("data:image/png;base64,AA=="), { mime: "image/png", base64: "AA==" });
  assert.equal(compressionRatio(1000, 725), 27.5);
  assert.equal(compressionRatio(1000, 1100), -10);
});
