import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

function svelteFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return svelteFiles(fullPath);
    return entry.name.endsWith(".svelte") ? [fullPath] : [];
  });
}

test("user-visible Svelte error state does not bypass localizeError", () => {
  const violations = [];
  const patterns = [
    /\b(?:error|Error|loadError)\s*=\s*[^\n;]*(?:\?*\.message|String\((?:err|error|cause))/g,
    /error:\s*(?:err|error|cause)\?*\.message/g,
    /error:\s*String\((?:err|error|cause)/g,
  ];
  for (const file of svelteFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${path.relative(sourceRoot, file)}:${line}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
