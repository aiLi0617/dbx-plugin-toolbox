import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    {
      name: "dbx-build-signal",
      closeBundle() {
        console.log("DBX_UI_BUILD_SUCCESS");
      },
    },
  ],
  // DBX inlines the entry module and its CSP only permits inline/blob scripts.
  // Keep one JS module and one stylesheet so no lazy asset needs a blocked URL.
  build: {
    outDir: "ui",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
