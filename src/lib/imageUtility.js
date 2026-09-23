export function clampInteger(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function gridSlices(width, height, rows, columns) {
  const w = clampInteger(width, 1, 12000);
  const h = clampInteger(height, 1, 12000);
  const r = clampInteger(rows, 1, 20, 3);
  const c = clampInteger(columns, 1, 20, 3);
  const slices = [];
  for (let row = 0; row < r; row += 1) {
    const y0 = Math.round(row * h / r);
    const y1 = Math.round((row + 1) * h / r);
    for (let column = 0; column < c; column += 1) {
      const x0 = Math.round(column * w / c);
      const x1 = Math.round((column + 1) * w / c);
      slices.push({ row: row + 1, column: column + 1, x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }
  return slices;
}

export function compressionRatio(originalBytes, compressedBytes) {
  const original = Math.max(0, Number(originalBytes) || 0);
  const compressed = Math.max(0, Number(compressedBytes) || 0);
  if (!original) return 0;
  return Math.round((1 - compressed / original) * 1000) / 10;
}

export function dataUrlParts(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s);
  return match ? { mime: match[1], base64: match[2] } : null;
}
