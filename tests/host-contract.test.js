import test from "node:test";
import assert from "node:assert/strict";
import { context, invoke, observeContext } from "../src/lib/host.js";

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

