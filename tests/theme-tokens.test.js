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
  assert.match(
    css,
    /--dbx-focus-ring:\s*0 0 0 3px color-mix\(in srgb,\s*var\(--color-ring,\s*var\(--color-primary\)\) 50%,\s*transparent\);/,
  );
});

test("custom select only shows focus chrome for keyboard focus", () => {
  const source = fs.readFileSync(
    new URL("../src/lib/Select.svelte", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /\.trigger\.keyboard-focus\s*\{[^}]*outline:\s*1px solid[^}]*box-shadow:\s*none;[^}]*\}/s,
  );
  assert.match(source, /onpointerdown=\{onTriggerPointerDown\}/);
  assert.match(source, /setTimeout\(\(\)\s*=>\s*\{\s*pointerFocusing\s*=\s*false;\s*\},\s*0\);/s);
  assert.match(source, /keyboardFocus\s*=\s*!pointerFocusing/);
  assert.match(source, /onmousedown=\{\(event\)\s*=>\s*\{\s*keyboardFocus\s*=\s*false;/s);
  assert.doesNotMatch(source, /\.trigger:focus-visible/);
  assert.doesNotMatch(source, /\.open \.trigger\s*\{/);
  assert.match(source, /box-shadow:\s*0 4px 12px rgb\(0 0 0 \/ 16%\)/);
  assert.doesNotMatch(source, /box-shadow:[^;]*CanvasText/);
});

test("focus chrome does not use mouse focus or legacy solid two-pixel rings", () => {
  const violations = [];

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const patterns = [
      /:focus(?!-visible|-within)[^{]*\{[^}]*outline:\s*2px/gs,
      /:focus(?!-visible|-within)[^{]*\{[^}]*box-shadow:(?!\s*none\b)\s*[^;}]+/gs,
      /:focus-within[^{]*\{[^}]*(?:outline|box-shadow):/gs,
      /box-shadow:\s*0 0 0 2px var\(--color-ring/gs,
    ];

    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${path.relative(sourceRoot, file)}:${line}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
