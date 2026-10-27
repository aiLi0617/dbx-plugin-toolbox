import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { transformFrames } from "../src/lib/gifEditing.js";

const source = readFileSync(new URL("../src/lib/GifEditorView.svelte", import.meta.url), "utf8");
function editor() {
  const state = {
    frames: Array.from({ length: 4 }, (_, index) => ({ index, delay: (index + 1) * 100, thumbnail: { id: index } })),
    busy: false, selected: 1, draggedFrame: null, dropTarget: null,
    invalidations: 0, invalidate() { this.invalidations++; },
  };
  // Use a closure so invalidation works as a plain function in the VM.
  state.invalidate = () => state.invalidations++;
  vm.createContext(state);
  vm.runInContext(source.slice(source.indexOf("  function moveTo("), source.indexOf("  function drawThumbnail(")), state);
  vm.runInContext(source.slice(source.indexOf("  function endDrag("), source.indexOf("  async function run(")), state);
  return state;
}

test("frame insertion keeps delays, previews and the extraction selection with their source frames", () => {
  const state = editor();
  vm.runInContext("moveTo(0, 3)", state);
  assert.deepEqual(Array.from(state.frames, f => f.index), [1, 2, 3, 0]);
  assert.deepEqual(Array.from(state.frames, f => [f.delay, f.thumbnail.id]), [[200, 1], [300, 2], [400, 3], [100, 0]]);
  assert.equal(state.selected, 0);
  vm.runInContext("moveTo(3, 2)", state);
  assert.deepEqual(Array.from(state.frames, f => f.index), [1, 2, 0, 3]);
  state.busy = true;
  vm.runInContext("moveTo(0, 3)", state);
  assert.equal(state.invalidations, 2);
});

test("drop positions work in both directions, at the end, and for a no-op", () => {
  const state = editor();
  state.event = { preventDefault() {} };
  for (const [from, insertion, expected] of [
    [0, 4, [1, 2, 3, 0]], [3, 0, [0, 1, 2, 3]],
    [1, 3, [0, 2, 1, 3]], [2, 3, [0, 2, 1, 3]],
  ]) {
    state.draggedFrame = from; state.dropTarget = insertion;
    vm.runInContext("dropFrame(event)", state);
    assert.deepEqual(Array.from(state.frames, f => f.index), expected);
    assert.equal(state.draggedFrame, null);
    assert.equal(state.dropTarget, null);
  }
  assert.equal(state.invalidations, 3);
});

test("worker returns small aspect-preserving composited previews without altering source frames", () => {
  const animation = { width: 128, height: 64, repeat: 0, frames: [
    { data: new Uint8ClampedArray(128 * 64 * 4).fill(50), delay: 100 },
    { data: new Uint8ClampedArray(128 * 64 * 4).fill(200), delay: 200 },
  ] };
  let result, transfers;
  const state = { decodeAnimation: () => animation, transformFrames, self: {
    postMessage(value, buffers) { result = value; transfers = buffers; },
  } };
  vm.createContext(state);
  const worker = readFileSync(new URL("../src/lib/gifEditorWorker.js", import.meta.url), "utf8");
  vm.runInContext(worker.slice(worker.indexOf("let animation;")), state);
  state.self.onmessage({ data: { action: "load", includeThumbnails: true } });
  assert.equal(result.thumbnails.width, 64);
  assert.equal(result.thumbnails.height, 32);
  assert.equal(result.thumbnails.frames[0][0], 50);
  assert.equal(result.thumbnails.frames[1][0], 200);
  assert.equal(result.thumbnails.frames[0].length, 64 * 32 * 4);
  assert.equal(transfers.length, 2);
  assert.equal(animation.frames[0].data.length, 128 * 64 * 4);
  state.self.onmessage({ data: { action: "load" } });
  assert.equal(result.thumbnails, null);
});
