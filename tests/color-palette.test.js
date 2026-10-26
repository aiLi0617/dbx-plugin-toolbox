import test from "node:test";
import assert from "node:assert/strict";
import { normalizePaletteHex, createPalette, exportPalette } from "../src/lib/colorPalette.js";

test("HEX input accepts short and unprefixed colors but rejects invalid input", () => {
  assert.equal(normalizePaletteHex(" abc "), "#AABBCC");
  assert.equal(normalizePaletteHex("#15988f"), "#15988F");
  for (const input of ["", "#12345", "#GGGGGG", "#12345678", "red"]) assert.equal(normalizePaletteHex(input), null);
  assert.throws(() => createPalette("invalid", "triadic"));
});

test("harmonies produce expected hues, counts, and accessible sample text", () => {
  const complement = createPalette("#ff0000", "complementary");
  assert.deepEqual(complement.map(c => c.hex), ["#FF0000", "#00FFFF"]);
  for (const [scheme, count] of [["complementary", 2], ["analogous", 3], ["triadic", 3], ["tetradic", 4], ["monochrome", 5]]) {
    for (const base of ["#15988F", "#000", "#fff", "#888"]) {
      const colors = createPalette(base, scheme);
      assert.equal(colors.length, count);
      for (const color of colors) {
        assert.match(color.hex, /^#[0-9A-F]{6}$/);
        assert.ok(color.contrast >= 4.5);
        assert.ok(["#000000", "#FFFFFF"].includes(color.text));
      }
    }
  }
});

test("exports contain all palette colors in usable CSS, JSON, HEX and SVG", () => {
  const colors = createPalette("#15988f", "triadic");
  assert.match(exportPalette(colors), /^:root \{\n  --color-1: #15988F;/);
  assert.equal(JSON.parse(exportPalette(colors, "json")).colors.length, 3);
  assert.deepEqual(exportPalette(colors, "hex").split("\n"), colors.map(c => c.hex));
  const svg = exportPalette(colors, "svg");
  assert.match(svg, /width="600"/);
  assert.equal((svg.match(/<rect /g) || []).length, 3);
  for (const { hex } of colors) assert.ok(svg.includes(hex));
});

test("all schemes honor the chosen count, with a hard limit of twelve", () => {
  for (const scheme of ["complementary", "analogous", "triadic", "tetradic", "monochrome"]) {
    for (let count = 2; count <= 12; count++) {
      const colors = createPalette("#15988f", scheme, count);
      assert.equal(colors.length, count);
      assert.equal(new Set(colors.map(c => c.hex)).size, count);
      assert.ok(colors.every(c => c.contrast >= 4.5));
    }
    for (const count of [1, 13, 2.5, NaN]) assert.throws(() => createPalette("#15988f", scheme, count));
  }
});
