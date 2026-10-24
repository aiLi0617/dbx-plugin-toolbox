import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { assetModules } from "./scripts/asset-modules.mjs";
import { sandboxEntry } from "./scripts/sandbox-entry.mjs";

export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    assetModules(),
    sandboxEntry(),
    {
      name: "dbx-build-signal",
      closeBundle() {
        const entry = "ui/index.html";
        // closeBundle also runs after an earlier build failure. Preserve the
        // original diagnostic instead of masking it with an ENOENT here.
        if (!existsSync(entry)) return;
        const normalized = readFileSync(entry, "utf8").replace(/\r+\n/g, "\n").replace(/\r/g, "\n");
        writeFileSync(entry, normalized);
        console.log("DBX_UI_BUILD_SUCCESS");
      },
    },
  ],
  // DBX inlines the entry into an opaque-origin srcdoc with script-src limited
  // to inline/blob scripts. Relative view chunks cannot load there. Keep the
  // UI graph together; heavy standalone assets still load via readAssetUrl.
  build: {
    outDir: "ui",
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
