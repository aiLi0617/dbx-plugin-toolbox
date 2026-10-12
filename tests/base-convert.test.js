import assert from "node:assert/strict";
import test from "node:test";

import {
  convertBaseLines,
  formatBaseInteger,
  normalizeFixedWidthInteger,
  reinterpretFixedWidthInteger,
} from "../src/lib/tools/convert.js";

test("base formatting supports uppercase digits and prefixes", () => {
  assert.equal(formatBaseInteger(0xfacebn, 16, { uppercase: true }), "FACEB");
  assert.equal(formatBaseInteger(0xfacebn, 16, { uppercase: true, prefix: true }), "0XFACEB");
  assert.equal(formatBaseInteger(35n, 36, { uppercase: true }), "Z");
});

test("fixed-width signed values use two's-complement output", () => {
  const value = normalizeFixedWidthInteger(255n, 8, true);
  assert.equal(value, -1n);
  assert.equal(formatBaseInteger(value, 10, { bits: 8, signed: true }), "-1");
  assert.equal(formatBaseInteger(value, 16, { bits: 8, signed: true, uppercase: true }), "FF");
  assert.equal(formatBaseInteger(value, 2, { bits: 8, signed: true, group: true }), "1111 1111");
  assert.equal(formatBaseInteger(-128n, 16, { bits: 8, signed: true }), "80");
  assert.throws(() => normalizeFixedWidthInteger(-129n, 8, true), /out of range/);
  assert.throws(() => normalizeFixedWidthInteger(256n, 8, true), /out of range/);
});

test("fixed-width unsigned values reject negatives and preserve the raw pattern", () => {
  assert.equal(normalizeFixedWidthInteger(255n, 8, false), 255n);
  assert.equal(formatBaseInteger(255n, 2, { bits: 8, signed: false }), "11111111");
  assert.equal(formatBaseInteger(1n, 16, { bits: 16, signed: false }), "0001");
  assert.throws(() => normalizeFixedWidthInteger(-1n, 8, false), /out of range/);
  assert.equal(reinterpretFixedWidthInteger(-1n, 8, false), 255n);
  assert.equal(reinterpretFixedWidthInteger(255n, 8, true), -1n);
});

test("batch conversion preserves blank lines and reports the failing line", () => {
  assert.equal(
    convertBaseLines("255\n16\n\n42", 10, 16, { uppercase: true }),
    "FF\n10\n\n2A",
  );
  assert.equal(
    convertBaseLines("255\n127", 10, 16, { bits: 8, signed: true, uppercase: true }),
    "FF\n7F",
  );
  assert.throws(
    () => convertBaseLines("10\nnot-a-number\n20", 10, 16),
    (error) => error.line === 2 && /line 2/i.test(error.message),
  );
});
