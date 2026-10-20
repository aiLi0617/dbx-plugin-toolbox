import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the component's actual save handler against the host's structured
// clone boundary. A reactive array must never reach postMessage unchanged.
const source = readFileSync(new URL("../src/lib/VaultView.svelte", import.meta.url), "utf8");
const start = source.indexOf("  async function savePurposes()");
const end = source.indexOf("  function onOverlayClick", start);
const handler = source.slice(start, end);

test("saving key purposes crosses the host clone boundary with reactive selections", async () => {
  const selected = new Proxy(["sm4-cipher"], {});
  assert.throws(() => structuredClone(selected), { name: "DataCloneError" });
  let request;
  let refreshed = false;
  const save = new Function("invoke", "run", "refresh", `
    let purposeEdit = { key: { id: "test-key" }, selected: arguments[3] };
    let purposeError = "";
    const ok = () => {};
    const t = (zh, en) => en;
    ${handler}
    return savePurposes;
  `)(
    async (method, params) => { request = { method, params: structuredClone(params) }; },
    async (task) => task(),
    async () => { refreshed = true; },
    selected,
  );
  await save();
  assert.deepEqual(request, {
    method: "toolbox/keys/update-purposes",
    params: { id: "test-key", allowedPurposes: ["sm4-cipher"] },
  });
  assert.equal(refreshed, true);
});
