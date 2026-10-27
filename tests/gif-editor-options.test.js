import test from "node:test";
import assert from "node:assert/strict";
import { validateGifOptions } from "../src/lib/gifEditorOptions.js";

const options = { width: 14, height: 9, colors: 128, repeat: 0, step: 1, frames: [{ delay: 100 }, { delay: 100 }, { delay: 100 }] };

test("GIF settings accept the small animation and reject invalid dimensions before encoding", () => {
  assert.equal(validateGifOptions(options), null);
  for (const width of [9999999, 4097, 0, -1, 1.5, undefined, NaN]) {
    assert.equal(validateGifOptions({ ...options, width })?.code, "dimensions");
  }
  assert.equal(validateGifOptions({ ...options, width: 4096, height: 1 }), null);
});

test("GIF pixel validation matches the worker allocation limit before skipping frames", () => {
  const frames = Array.from({ length: 30 }, () => ({ delay: 100 }));
  assert.equal(validateGifOptions({ ...options, width: 1000, height: 800, frames }), null);
  assert.equal(validateGifOptions({ ...options, width: 1000, height: 801, step: 30, frames })?.code, "pixels");
});

test("GIF settings validate palette, repeat, step and combined frame delays", () => {
  for (const [key, value, code] of [["colors", 257, "colors"], ["repeat", -2, "repeat"], ["step", 0, "step"], ["step", 1.5, "step"]]) {
    assert.equal(validateGifOptions({ ...options, [key]: value })?.code, code);
  }
  const frames = [{ delay: 400000 }, { delay: 400000 }];
  assert.equal(validateGifOptions({ ...options, frames }), null);
  assert.equal(validateGifOptions({ ...options, frames, step: 2 })?.code, "delays");
  assert.equal(validateGifOptions({ ...options, frames: [{ delay: undefined }] })?.code, "delays");
});

test("GIF crop settings stay within source bounds", () => {
  const crop = { ...options, sourceWidth: 20, sourceHeight: 20, crop: { x: 6, y: 11 } };
  assert.equal(validateGifOptions(crop), null);
  assert.equal(validateGifOptions({ ...crop, crop: { x: 7, y: 11 } })?.code, "crop");
  assert.equal(validateGifOptions({ ...crop, crop: { x: 0.5, y: 0 } })?.code, "crop");
});
