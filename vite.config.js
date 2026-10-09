import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { assetModules } from "./scripts/asset-modules.mjs";

export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    assetModules(),
    {
      name: "dbx-build-signal",
      closeBundle() {
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
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
