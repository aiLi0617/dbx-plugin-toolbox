import test from "node:test";
import assert from "node:assert/strict";
import { context, invoke, observeContext } from "../src/lib/host.js";
import { errorMessage } from "../src/lib/errorMessage.js";

test("generic RPC envelopes retain the concrete error without reading request data", async (t) => {
  const originalWindow = globalThis.window;
  globalThis.window = { dbxPlugin: { invoke: async () => { throw { message: "Request failed", code: -32603, data: { message: "Key not found", params: { password: "must-not-be-read" } } }; } } };
  t.after(() => { globalThis.window = originalWindow; });
  await assert.rejects(invoke("toolbox/keys/export"), (error) => {
    assert.equal(error.message, "Key not found");
    assert.equal(error.code, "-32603");
    assert.equal(error.method, "toolbox/keys/export");
    assert.doesNotMatch(JSON.stringify(error), /must-not-be-read/);
    return true;
  });
  assert.equal(errorMessage({ message: "Clipboard is busy", data: { message: "Unknown detail" } }), "Clipboard is busy");
  const circular = { message: "Request failed" };
  circular.cause = circular;
  assert.equal(errorMessage(circular), "Request failed");
  assert.equal(errorMessage({ params: { password: "must-not-be-read" }, data: { secret: "must-not-be-read" } }), "");
});

test("invoke clamps timeout to the DBX Host API limit", async (t) => {
  const originalWindow = globalThis.window;
  const calls = [];
  globalThis.window = {
    dbxPlugin: {
      ready: Promise.resolve(),
      invoke: async (_method, _params, options) => {
        calls.push(options.timeoutMs);
        return true;
      },
    },
  };
  t.after(() => { globalThis.window = originalWindow; });

  await invoke("toolbox/test", {}, 600_000);
  await invoke("toolbox/test", {}, 0);
  assert.deepEqual(calls, [120_000, 1]);
});

test("context helpers expose the snapshot and unsubscribe contract", (t) => {
  const originalWindow = globalThis.window;
  let listener;
  let removed = false;
  globalThis.window = {
    dbxPlugin: {
      context: { toolId: "json", action: "format" },
      onContext: (callback) => { listener = callback; return () => { removed = true; }; },
    },
  };
  t.after(() => { globalThis.window = originalWindow; });
  assert.deepEqual(context(), { toolId: "json", action: "format" });
  let seen;
  const off = observeContext((value) => { seen = value; });
  listener({ toolId: "hash" });
  assert.deepEqual(seen, { toolId: "hash" });
  off();
  assert.equal(removed, true);
});

