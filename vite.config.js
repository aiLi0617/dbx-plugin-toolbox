import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { assetModules } from "./scripts/asset-modules.mjs";

export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    assetModules(),
    {
      name: "dbx-build-signal",
      closeBundle() {
        const entry = "ui/index.html";
        const normalized = readFileSync(entry, "utf8").replace(/\r+\n/g, "\n").replace(/\r/g, "\n");
        writeFileSync(entry, normalized);
        console.log("DBX_UI_BUILD_SUCCESS");
      },
    },
  ],
  // DBX inlines the entry module and its CSP only permits inline/blob scripts.
  // Keep UI code/CSS inline; heavy libraries are separate self-contained assets
  // loaded through readAssetUrl, never through relative module URLs.
  build: {
    outDir: "ui",
    emptyOutDir: true,
    cssCodeSplit: false,
    // DBX requires the application entry to remain a single inline bundle.
    // Heavy third-party libraries are emitted by assetModules instead.
    chunkSizeWarningLimit: 2500,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
