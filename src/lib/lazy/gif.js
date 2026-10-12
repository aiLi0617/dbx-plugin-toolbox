import { GIFEncoder, applyPalette, quantize } from "gifenc";

export function encodeGif(frames, width, height, { delay = 300, repeat = 0, colors = 128 } = {}) {
  const gif = GIFEncoder();
  for (const frame of frames) {
    const palette = quantize(frame.data, Math.min(256, Math.max(2, colors)));
    const index = applyPalette(frame.data, palette);
    gif.writeFrame(index, width, height, { palette, delay: frame.delay ?? delay, repeat });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}
