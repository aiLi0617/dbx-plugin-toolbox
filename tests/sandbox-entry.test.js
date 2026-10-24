import assert from "node:assert/strict";
import test from "node:test";
import { build } from "vite";
import { sandboxEntry } from "../scripts/sandbox-entry.mjs";

// This models viewRegistry's import('./TotpView.svelte'). The host inlines the
// entry, so any emitted relative module dependency would be blocked by CSP.
function fixture(inlineDynamicImports) {
  return build({
    configFile: false,
    logLevel: "silent",
    plugins: [
      {
        name: "virtual-view-fixture",
        resolveId(id) { if (["virtual:entry", "virtual:totp"].includes(id)) return id; },
        load(id) {
          if (id === "virtual:entry") return 'export const openTotp = () => import("virtual:totp")';
          if (id === "virtual:totp") return 'export default function TotpView() { return "saved TOTP"; }';
        },
      },
      sandboxEntry(),
    ],
    build: {
      write: false,
      minify: false,
      modulePreload: false,
      rollupOptions: { input: "virtual:entry", preserveEntrySignatures: "strict", output: { inlineDynamicImports } },
    },
  });
}

test("DBX build rejects lazy view chunks that the sandbox cannot import", async () => {
  await assert.rejects(fixture(false), /must not depend on relative module chunks/);
});

test("DBX build keeps lazy view dispatch inside one inline-compatible entry", async () => {
  const result = await fixture(true);
  const chunks = result.output.filter(item => item.type === "chunk");
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].imports, []);
  assert.deepEqual(chunks[0].dynamicImports, []);
  assert.match(chunks[0].code, /saved TOTP/);
});
