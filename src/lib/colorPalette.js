import { palette } from "./contentExpansion.js";
import { parseRgbaColor, contrastRatio, formatColorValue } from "./colorContrast.js";
import { hslToRgb } from "./tools/convert.js";

export const MAX_PALETTE_COLORS = 12;

export function normalizePaletteHex(value) {
  const raw = String(value).trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(raw)) return null;
  return `#${(raw.length === 3 ? [...raw].map(c => c + c).join("") : raw).toUpperCase()}`;
}

export function createPalette(base, scheme, count) {
  const hex = normalizePaletteHex(base);
  if (!hex) throw new Error("Invalid color");
  let seeds = palette(hex, scheme);
  if (count !== undefined) {
    if (!Number.isInteger(count) || count < 2 || count > MAX_PALETTE_COLORS) throw new Error("Invalid color count");
    seeds = Array.from({ length: count }, (_, index) => {
      let seed = seeds[index % seeds.length];
      if (scheme === "monochrome") seed = { ...seeds[0], l: 0.15 + index / (count - 1) * 0.7 };
      else if (index >= seeds.length) {
        const layer = Math.floor(index / seeds.length);
        const layers = Math.ceil(count / seeds.length);
        const step = Math.ceil(layer / 2) / Math.ceil((layers - 1) / 2);
        seed = { ...seed, l: layer % 2 ? seed.l + (1 - seed.l) * step * 0.65 : seed.l * (1 - step * 0.65) };
      }
      const rgb = hslToRgb(seed.h, seed.s, seed.l);
      return { ...seed, hex: formatColorValue(rgb), css: `hsl(${seed.h.toFixed(1)} ${(seed.s * 100).toFixed(1)}% ${(seed.l * 100).toFixed(1)}%)` };
    });
  }
  return seeds.map(item => {
    const rgb = parseRgbaColor(item.hex);
    const white = contrastRatio(rgb, { r: 255, g: 255, b: 255 });
    const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 });
    return { ...item, hex: item.hex.toUpperCase(), rgb: formatColorValue(rgb, "rgb"),
      text: white >= black ? "#FFFFFF" : "#000000", contrast: Math.max(white, black) };
  });
}

export function exportPalette(colors, format = "css") {
  if (format === "json") return JSON.stringify({ colors: colors.map(({ hex, rgb, css }) => ({ hex, rgb, hsl: css })) }, null, 2);
  if (format === "hex") return colors.map(c => c.hex).join("\n");
  if (format === "svg") return `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length * 200}" height="240" viewBox="0 0 ${colors.length * 200} 240">\n${colors.map((c, i) => `  <rect x="${i * 200}" width="200" height="240" fill="${c.hex}"/>\n  <text x="${i * 200 + 20}" y="210" fill="${c.text}" font-family="monospace" font-size="20">${c.hex}</text>`).join("\n")}\n</svg>`;
  return `:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join("\n")}\n}`;
}
