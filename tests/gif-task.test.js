import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createTaskScope } from "../src/lib/taskManager.js";

const source = readFileSync(new URL("../src/lib/GifEditorView.svelte", import.meta.url), "utf8");
const requestCode = source.slice(source.indexOf("  function request(message)"), source.indexOf("  function invalidate()"));
test("GIF generation works without form submission in the DBX sandbox", () => {
  assert.match(source, /type="button" onclick=\{run\}/);
  assert.doesNotMatch(source, /type="submit"|onsubmit=/);
});

test("GIF crop generation sends the selection to the worker and opens the encoded result", async () => {
  const calls = [];
  const state = {
    file: { name: "edited.gif" }, busy: false, validation: null,
    error: "", taskProgress: 1, frames: [{ index: 0, delay: 100 }, { index: 1, delay: 200 }, { index: 2, delay: 100 }],
    repeat: 0, width: 14, height: 9, step: 1, toolId: "gif-crop",
    x: 0, y: 1, cropWidth: 5, cropHeight: 6, colors: 128,
    disposed: false, blob: null, url: "", previewResult: false,
    invalidate() {}, Blob, URL: { createObjectURL: () => "blob:result" },
    request: async message => { calls.push(message); return { output: new Uint8Array([71, 73, 70]) }; },
  };
  vm.createContext(state);
  vm.runInContext(source.slice(source.indexOf("  async function run()"), source.indexOf("  async function extract()")), state);
  await vm.runInContext("run()", state);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, "encode");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].options.crop)), { x: 0, y: 1, width: 5, height: 6 });
  assert.equal(calls[0].options.width, 5);
  assert.equal(calls[0].options.height, 6);
  assert.equal(state.url, "blob:result");
  assert.equal(state.blob.type, "image/gif");
  assert.equal(state.previewResult, true);
  assert.equal(state.busy, false);
});
test("GIF retry after cancellation reloads worker state from the retained source", async () => {
  const calls = [], file = new File(["gif"], "sample.gif");
  const state = { taskScope: createTaskScope("gif-compress", "gif"), file, worker: null, workerLoaded: false, taskProgress: null,
    Worker: class {}, stop() {}, requestCore: async (message, update) => { calls.push(message.action); update({ stage: "encode", progress: 1 }); return { output: new Uint8Array([1]) }; },
  };
  vm.createContext(state); vm.runInContext(requestCode, state);
  const result = await vm.runInContext('request({ action: "encode", options: {}, colors: 128 })', state);
  assert.deepEqual(calls, ["load", "encode"]);
  assert.equal(state.file, file);
  assert.equal(result.output.length, 1);
  await vm.runInContext('request({ action: "encode", options: {}, colors: 128 })', state);
  assert.deepEqual(calls, ["load", "encode", "encode"]);
});

test("all GIF cancel controls use task cancellation without discarding the source", async () => {
  const handlers = [...source.matchAll(/onclick=\{(\(\) => taskScope\.cancel\(\))\}>\{t\("取消", "Cancel"\)\}/g)];
  assert.equal(handlers.length, 2);
  let cancellations = 0;
  for (const [, handler] of handlers) {
    const state = { taskScope: { cancel() { cancellations++; } }, file: { name: "source.gif" }, frames: [1, 2] };
    vm.createContext(state); vm.runInContext(`(${handler})()`, state);
    assert.equal(state.file.name, "source.gif");
    assert.equal(state.frames.length, 2);
  }
  assert.equal(cancellations, 2);
});

test("GIF dimension edits preserve source proportions and invalidate the old result", () => {
  const code = source.slice(source.indexOf("  function resizeDimension("), source.indexOf("  $effect("));
  let invalidations = 0;
  const state = { sourceWidth: 640, sourceHeight: 480, width: 640, height: 480, lockRatio: true, invalidate() { invalidations++; } };
  vm.createContext(state); vm.runInContext(code, state);
  vm.runInContext('resizeDimension("width", "320")', state);
  assert.equal(state.width, 320); assert.equal(state.height, 240);
  vm.runInContext('resizeDimension("height", "120")', state);
  assert.equal(state.width, 160); assert.equal(state.height, 120);
  state.lockRatio = false;
  vm.runInContext('resizeDimension("width", "80")', state);
  assert.equal(state.width, 80); assert.equal(state.height, 120);
  vm.runInContext('resizeDimension("height", "")', state);
  assert.equal(state.height, undefined);
  vm.runInContext('resetDimensions()', state);
  assert.equal(state.width, 640); assert.equal(state.height, 480);
  assert.equal(invalidations, 5);
});
