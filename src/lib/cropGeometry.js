export function constrainCrop(rect, width, height) {
  const integer = (value, fallback) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  const w = Math.max(1, Math.min(width, integer(rect.width, width)));
  const h = Math.max(1, Math.min(height, integer(rect.height, height)));
  return { width: w, height: h, x: Math.max(0, Math.min(width - w, integer(rect.x, 0))), y: Math.max(0, Math.min(height - h, integer(rect.y, 0))) };
}
