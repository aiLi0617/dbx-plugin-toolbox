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

test("non-semantic shadows do not derive from the theme foreground", () => {
  const violations = [];

  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");

    for (const match of source.matchAll(/box-shadow\s*:\s*([^;}]*CanvasText[^;}]*);/gi)) {
      if (match[1].includes("var(--color-border")) continue;
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${path.relative(sourceRoot, file)}:${line}: ${match[0]}`);
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

test("interactive states use DBX theme aliases instead of browser defaults", () => {
  const css = fs.readFileSync(new URL("../src/app.css", import.meta.url), "utf8");

  assert.match(css, /--dbx-hover-background:\s*var\(--color-accent,\s*var\(--color-muted\)\);/);
  assert.match(css, /--dbx-hover-foreground:\s*var\(--color-accent-foreground,\s*var\(--color-foreground\)\);/);
  assert.match(css, /:where\(button\)\s*\{[^}]*appearance:\s*none;[^}]*background:\s*transparent;/s);
  assert.match(css, /:where\(button:not\(:disabled\):hover\)\s*\{[^}]*var\(--dbx-hover-background\)/s);
  assert.match(css, /--dbx-range-track:\s*var\(--dbx-control-border\);/);
  assert.match(css, /:where\(input\[type="range"\]:hover\),[^{]*\{[^}]*--dbx-range-track:\s*var\(--color-ring,/s);
  assert.match(css, /:where\(input\[type="range"\]::-webkit-slider-thumb\)\s*\{[^}]*background:\s*var\(--color-primary\);/s);
  assert.match(css, /:where\(input\[type="color"\]:hover\)\s*\{[^}]*var\(--color-ring,/s);
  assert.match(css, /:where\(\.file-button:hover\)\s*\{[^}]*var\(--dbx-hover-background\)/s);
});

test("large file drop targets opt in to themeable hover and focus states", () => {
  for (const name of ["GifToolsView.svelte", "ImageOcrView.svelte", "ImageStitchView.svelte"]) {
    const source = fs.readFileSync(new URL(`../src/lib/${name}`, import.meta.url), "utf8");
    assert.match(source, /class="drop file-button"/, name);
  }
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

test("color copy format uses the themeable custom select menu", () => {
  const source = fs.readFileSync(
    new URL("../src/lib/ColorConvertView.svelte", import.meta.url),
    "utf8",
  );

  assert.match(source, /import Select from "\.\/Select\.svelte";/);
  assert.match(source, /<Select[\s\S]*class="copy-format-select"[\s\S]*value=\{copyFormat\}[\s\S]*onchange=\{updateCopyFormat\}/);
  assert.doesNotMatch(source, /<select[^>]*bind:value=\{copyFormat\}/);
  assert.match(source, /let contrastColor = \$state\(parseRgbaColor\("FFFFFF"\)\);/);
  assert.match(source, /contrastHex = formatEditableColorValue\(background, format\);/);
});

test("brightness slider keeps its thumb centered at both endpoints", () => {
  const source = fs.readFileSync(
    new URL("../src/lib/ColorWheelPicker.svelte", import.meta.url),
    "utf8",
  );

  assert.match(source, /const VALUE_THUMB_RADIUS = 7;/);
  assert.match(
    source,
    /event\.clientY - rect\.top - VALUE_THUMB_RADIUS\) \/ travel/,
  );
  assert.match(source, /transform:\s*translate\(-50%, -50%\);/);
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
