import { build } from "vite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ASSET_MODULE_NAMES } from "../src/lib/assetModules.js";

export function assetModules() {
  return {
    name: "dbx-asset-modules",
    async generateBundle() {
      const cacheDir = resolve(".vite-asset-cache");
      mkdirSync(cacheDir, { recursive: true });
      const lockfile = resolve("package-lock.json");
      for (const name of ASSET_MODULE_NAMES) {
        const entry = fileURLToPath(new URL(`../src/lib/lazy/${name}.js`, import.meta.url));
        this.addWatchFile(entry);
        const key = createHash("sha256")
          .update(name)
          .update(readFileSync(entry))
          .update(existsSync(lockfile) ? readFileSync(lockfile) : "")
          .digest("hex");
        const cacheFile = resolve(cacheDir, `${name}.${key}.js`);
        let source;
        if (existsSync(cacheFile)) {
          source = readFileSync(cacheFile, "utf8");
          console.log(`[asset] ${name}: cache hit`);
        } else {
          const started = Date.now();
          console.log(`[asset] ${name}: building`);
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
          source = outputs[0].code;
          writeFileSync(cacheFile, source);
          console.log(`[asset] ${name}: built in ${Date.now() - started} ms`);
        }
        // Keep emitted files flat. Rollup may write assets concurrently and on
        // Windows multiple recursive mkdir calls for the same nested folder can
        // intermittently fail with EPERM.
        this.emitFile({ type: "asset", fileName: `assets/lazy-${name}.js`, source });
      }
    },
  };
}

