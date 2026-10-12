import assert from "node:assert/strict";
import test from "node:test";
import { OCR_CHUNK_BYTES, ocrBinaryChannel, splitOcrBytes } from "../src/lib/nativeOcr.js";

test("native OCR splits images below the DBX binary frame limit", () => {
  const bytes = new Uint8Array(OCR_CHUNK_BYTES * 2 + 3);
  const chunks = splitOcrBytes(bytes);
  assert.deepEqual(chunks.map((chunk) => chunk.byteLength), [OCR_CHUNK_BYTES, OCR_CHUNK_BYTES, 3]);
  assert.ok(chunks.every((chunk) => chunk.byteLength < 8 * 1024 * 1024));
});

test("native OCR splits the maximum accepted image into five upload chunks", () => {
  const chunks = splitOcrBytes(new Uint8Array(20_000_000));
  assert.equal(chunks.length, 5);
  assert.equal(chunks.reduce((total, chunk) => total + chunk.byteLength, 0), 20_000_000);
});

test("native OCR uses stable per-session chunk channels", () => {
  assert.equal(ocrBinaryChannel("toolbox/ocr/session", 2), "toolbox/ocr/session/2");
  assert.throws(() => ocrBinaryChannel("toolbox/ocr/session", -1), TypeError);
});
