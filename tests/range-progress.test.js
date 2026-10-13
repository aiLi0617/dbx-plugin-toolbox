import test from "node:test";
import assert from "node:assert/strict";
import { rangeProgressPercent } from "../src/rangeProgress.js";

test("range progress accounts for arbitrary minimum and maximum values", () => {
  assert.equal(rangeProgressPercent({ min: 0, max: 100, value: 50 }), 50);
  assert.equal(rangeProgressPercent({ min: 10, max: 100, value: 55 }), 50);
  assert.equal(rangeProgressPercent({ min: -20, max: 20, value: 0 }), 50);
});

test("range progress clamps values and handles invalid ranges", () => {
  assert.equal(rangeProgressPercent({ min: 10, max: 20, value: 5 }), 0);
  assert.equal(rangeProgressPercent({ min: 10, max: 20, value: 25 }), 100);
  assert.equal(rangeProgressPercent({ min: 10, max: 10, value: 10 }), 0);
  assert.equal(rangeProgressPercent({ min: "bad", max: 100, value: 50 }), 0);
});
