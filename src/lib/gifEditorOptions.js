const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

// Match the worker's allocation limit before frame skipping is applied.
export function validateGifOptions({ width, height, colors, repeat, step, frames, crop, sourceWidth, sourceHeight }) {
  const fields = [];
  if (!integerIn(width, 1, 4096)) fields.push("width");
  if (!integerIn(height, 1, 4096)) fields.push("height");
  if (fields.length) return { code: "dimensions", fields };
  if (crop && (!integerIn(crop.x, 0, sourceWidth - 1) || !integerIn(crop.y, 0, sourceHeight - 1) || crop.x + width > sourceWidth || crop.y + height > sourceHeight)) return { code: "crop", fields: ["crop"] };
  if (!integerIn(colors, 2, 256)) return { code: "colors", fields: ["colors"] };
  if (!integerIn(repeat, -1, 65535)) return { code: "repeat", fields: ["repeat"] };
  if (!integerIn(step, 1, 300)) return { code: "step", fields: ["step"] };
  if (!frames.length || frames.length > 300 || width * height * frames.length > 24_000_000) return { code: "pixels", fields: ["width", "height"] };
  for (let start = 0; start < frames.length; start += step) {
    const delays = frames.slice(start, start + step).map(frame => frame.delay);
    if (delays.some(delay => !Number.isFinite(delay) || delay < 0 || delay > 655350) || delays.reduce((sum, delay) => sum + delay, 0) > 655350) return { code: "delays", fields: ["step", "delays"] };
  }
  return null;
}
