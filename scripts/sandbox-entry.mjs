// Validate Rollup's output, not source imports: a successful normal web build
// can still fail inside DBX's inline/blob-only script sandbox.
export function sandboxEntry() {
  return {
    name: "dbx-sandbox-entry",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        if (output.imports.length || output.dynamicImports.length) {
          this.error(`DBX sandbox entry must not depend on relative module chunks: ${output.fileName}`);
        }
        if (Buffer.byteLength(output.code, "utf8") > 8 * 1024 * 1024) {
          this.error("DBX sandbox entry exceeds the 8 MiB host resource limit");
        }
      }
    },
  };
}
