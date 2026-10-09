import { build } from "vite";
import { fileURLToPath } from "node:url";
import { ASSET_MODULE_NAMES } from "../src/lib/assetModules.js";

export function assetModules() {
  return {
    name: "dbx-asset-modules",
    async generateBundle() {
      for (const name of ASSET_MODULE_NAMES) {
        const entry = fileURLToPath(new URL(`../src/lib/lazy/${name}.js`, import.meta.url));
        this.addWatchFile(entry);
        const result = await build({
          configFile: false,
          logLevel: "error",
          build: {
            write: false,
            minify: "esbuild",
            modulePreload: false,
            rollupOptions: { input: entry, preserveEntrySignatures: "strict", output: { format: "es", entryFileNames: `${name}.js`, inlineDynamicImports: true } },
          },
        });
        const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output);
        if (outputs.length !== 1 || outputs[0].type !== "chunk" || outputs[0].imports.length || outputs[0].dynamicImports.length) {
          this.error(`Asset module ${name} must be one self-contained JavaScript module`);
        }
        this.emitFile({ type: "asset", fileName: `assets/lazy/${name}.js`, source: outputs[0].code });
      }
    },
  };
}

