import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }

    return /\.(?:css|svelte)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("component theme tokens do not pin DBX colors to hex fallbacks", () => {
  const violations = [];

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const patterns = [
      /var\(--color-[\w-]+\s*,\s*#[0-9a-f]{3,8}\b/gi,
      /#(?:2563eb|93c5fd|dc2626|d49a00|d99a20)\b/gi,
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(
          `${path.relative(sourceRoot, file)}:${line}: ${match[0]}`,
        );
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("persistent selection aliases follow the injected DBX primary pair", () => {
  const css = fs.readFileSync(new URL("../src/app.css", import.meta.url), "utf8");

  assert.match(
    css,
    /--dbx-selection-background:\s*var\(--color-primary\);/,
  );
  assert.match(
    css,
    /--dbx-selection-foreground:\s*var\(--color-primary-foreground\);/,
  );
  assert.match(css, /--dbx-selection-border:\s*var\(--color-primary\);/);
});
