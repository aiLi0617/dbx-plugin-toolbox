import test from "node:test";
import assert from "node:assert/strict";
import { convertRomanLines } from "../src/lib/romanBatch.js";

test("Roman batch detects both directions and keeps source line numbers", () => {
  const rows = convertRomanLines(" 2026 \r\n\r\n mmxxvi \n49\rix");
  assert.deepEqual(rows.map(({line, result}) => [line, result]), [[1,"MMXXVI"],[3,"2026"],[4,"XLIX"],[5,"9"]]);
  assert.ok(rows.every(row => !row.error));
});

test("Roman batch errors do not discard valid neighboring results", () => {
  const rows = convertRomanLines("0\nIV\nIIII\n4000\n-1\n1.5\nhello\n3999");
  assert.deepEqual(rows.map(row => row.error), ["range","","numeral","range","range","range","numeral",""]);
  assert.equal(rows[1].result, "4");
  assert.equal(rows[7].result, "MMMCMXCIX");
  assert.deepEqual(convertRomanLines(" \n\t"), []);
});
