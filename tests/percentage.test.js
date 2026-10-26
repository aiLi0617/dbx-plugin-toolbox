import test from "node:test";
import assert from "node:assert/strict";
import { calculatePercentage } from "../src/lib/percentage.js";

test("percentage calculations preserve direction and isolate undefined ratios", () => {
  const demo = calculatePercentage("20", "80");
  assert.deepEqual([demo.percentOf, demo.share, demo.change], [16, 25, 300]);
  const zeroStart = calculatePercentage("0", "80");
  assert.deepEqual([zeroStart.percentOf, zeroStart.share, zeroStart.change], [0, 0, null]);
  const zeroEnd = calculatePercentage("20", "0");
  assert.deepEqual([zeroEnd.percentOf, zeroEnd.share, zeroEnd.change], [0, null, -100]);
  assert.equal(calculatePercentage("-20", "-10").change, 50);
  assert.equal(calculatePercentage("1", "3", 4).share, 33.33);
});

test("percentage input validation and overflow do not emit non-finite results", () => {
  for (const input of ["", " ", "abc", "Infinity"]) assert.throws(() => calculatePercentage(input, "1"));
  for (const digits of [0, 16, 1.5, NaN]) assert.throws(() => calculatePercentage("1", "3", digits));
  assert.equal(calculatePercentage("1e308", "100").percentOf, 1e308);
  assert.equal(calculatePercentage("1e308", "1e308").percentOf, null);
  assert.equal(calculatePercentage("-1e308", "1e308").change, 200);
});
