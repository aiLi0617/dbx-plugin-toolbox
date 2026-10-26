import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatch, formatStopwatch, lapRows, lapsCsv } from "../src/lib/stopwatch.js";

test("stopwatch samples click time, excludes pauses and ignores duplicate starts", () => {
  let now = 100;
  const clock = createStopwatch(() => now);
  clock.start(); now = 115.125; clock.start(); now = 131.75;
  assert.equal(clock.read(), 31.75);
  assert.equal(clock.pause(), 31.75);
  now = 900; assert.equal(clock.read(), 31.75);
  clock.start(); now = 910.25; assert.equal(clock.pause(), 42);
  clock.pause(); assert.equal(clock.read(), 42);
  clock.reset(); now = 2000; assert.equal(clock.read(), 0);
  clock.start(); now = 2020; assert.equal(clock.read(), 20);
});
test("time display handles minute and hour boundaries", () => {
  assert.equal(formatStopwatch(0), "00:00.000");
  assert.equal(formatStopwatch(59999.9), "00:59.999");
  assert.equal(formatStopwatch(60000), "01:00.000");
  assert.equal(formatStopwatch(3600000), "01:00:00.000");
  assert.equal(formatStopwatch(360000000), "100:00:00.000");
});
test("CSV preserves chronological numbering and derives splits before rounding", () => {
  assert.deepEqual(lapRows([100.125, 222.875]), [
    { number: 1, total: 100.125, split: 100.125 },
    { number: 2, total: 222.875, split: 122.75 },
  ]);
  assert.equal(lapsCsv([100.125, 222.875]), "lap,total_ms,split_ms\r\n1,100.125,100.125\r\n2,222.875,122.750");
});
