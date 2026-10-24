import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createTaskScope } from "../src/lib/taskManager.js";

const source = readFileSync(new URL("../src/lib/GifEditorView.svelte", import.meta.url), "utf8");
const requestCode = source.slice(source.indexOf("  function request(message)"), source.indexOf("  function invalidate()"));
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
