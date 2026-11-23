import { build } from "esbuild";
import { resolve } from "node:path";

const { metafile } = await build({
  entryPoints: ["backend/js/utilities.js"],
  outfile: process.argv[2],
  bundle: true,
  format: "iife",
  globalName: "toolbox",
  platform: "browser",
  target: "es2023",
  minify: true,
  metafile: true,
  legalComments: "inline",
});

for (const file of Object.keys(metafile.inputs)) {
  if (file.startsWith("src/")) console.log(`cargo:rerun-if-changed=${resolve(file)}`);
}
