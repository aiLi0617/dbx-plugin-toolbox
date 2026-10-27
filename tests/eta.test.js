import test from "node:test";
import assert from "node:assert/strict";
import { calculateEta, validateEta } from "../src/lib/eta.js";

const now = Date.UTC(2026, 9, 26);
test("ETA projects remaining work from a fixed measurement time", () => {
  const result = calculateEta("100", "40", "120", 1, now);
  assert.equal(result.remainingSeconds, 180);
  assert.equal(result.totalSeconds, 300);
  assert.equal(result.progress, 40);
  assert.equal(result.rate, 1 / 3);
  assert.equal(result.completion, "2026-10-26T00:03:00.000Z");
  assert.equal(result.remaining, 60);
});
test("elapsed units and fractional work produce equivalent estimates", () => {
  assert.deepEqual(calculateEta(100, 40, 2, 60, now), calculateEta(100, 40, 120, 1, now));
  assert.equal(calculateEta(2.5, 0.5, 1, 3600, now).remainingSeconds, 14400);
});
test("zero progress has no estimate and completed work has no remaining time", () => {
  const pending = calculateEta(100, 0, 120, 1, now);
  assert.equal(pending.completion, null);
  assert.equal(pending.remainingSeconds, null);
  assert.equal(pending.rate, 0);
  const done = calculateEta(100, 100, 120, 1, now);
  assert.equal(done.remainingSeconds, 0);
  assert.equal(done.progress, 100);
  assert.equal(done.completion, new Date(now).toISOString());
});
test("invalid and incomplete progress is rejected before arithmetic", () => {
  for (const values of [["", 1, 1], [" ", 0, 1], [0, 0, 1], [-1, 0, 1], [100, -1, 1], [100, 101, 1], [100, "", 1], [100, 1, 0], [100, 1, Infinity], [100, 1, "abc"], [100, 1, 1, 2]]) {
    assert.ok(Object.keys(validateEta(...values)).length);
    assert.throws(() => calculateEta(...values), RangeError);
  }
});
test("unrepresentable durations and dates do not emit Infinity or invalid JSON", () => {
  assert.throws(() => calculateEta(1e308, 1, 1e308, 1, now), RangeError);
  assert.throws(() => calculateEta(100, 1, 1e15, 1, now), RangeError);
});
