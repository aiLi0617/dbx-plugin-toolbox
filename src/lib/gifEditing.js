import { parseGIF, decompressFrame } from "gifuct-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc/dist/gifenc.esm.js";
const MAX_PIXELS = 24_000_000;
export function decodeAnimation(buffer, onProgress = () => {}) {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length > 30_000_000 ||
    !/^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0, 6)))
  )
    throw new Error("Invalid GIF or file exceeds 30 MB");
  const gif = parseGIF(buffer),
    { width, height } = gif.lsd,
    raw = gif.frames.filter((f) => f.image);
  if (
    !width ||
    !height ||
    width > 4096 ||
    height > 4096 ||
    !raw.length ||
    raw.length > 300 ||
    width * height * raw.length > MAX_PIXELS
  )
    throw new Error("GIF exceeds frame or pixel limits");
  const canvas = new Uint8ClampedArray(width * height * 4),
    frames = [];
  const bg = gif.gct?.[gif.lsd.backgroundColorIndex] || [0, 0, 0];
  const transparent = raw.some((f) => f.gce?.extras?.transparentColorGiven);
  const background = transparent ? [0, 0, 0, 0] : [...bg, 255];
  function fill(rect) {
    for (let y = rect.top; y < rect.top + rect.height; y++)
      for (let x = rect.left; x < rect.left + rect.width; x++)
        canvas.set(background, (y * width + x) * 4);
  }
  fill({ top: 0, left: 0, width, height });
  for (const f of raw) {
    const d = f.image.descriptor;
    if (
      d.width * d.height > MAX_PIXELS ||
      d.left + d.width > width ||
      d.top + d.height > height
    )
      throw new Error("Invalid GIF frame rectangle");
    const frame = decompressFrame(f, gif.gct, true);
    const before = frame.disposalType === 3 ? canvas.slice() : null;
    for (let y = 0; y < d.height; y++)
      for (let x = 0; x < d.width; x++) {
        const source = (y * d.width + x) * 4;
        if (frame.patch[source + 3])
          canvas.set(
            frame.patch.subarray(source, source + 4),
            ((d.top + y) * width + d.left + x) * 4,
          );
      }
    frames.push({
      data: canvas.slice(),
      delay: f.gce ? f.gce.delay * 10 : 100,
    });
    if (frame.disposalType === 2) fill(d);
    else if (before) canvas.set(before);
    onProgress({ stage: "decode", progress: frames.length / raw.length });
  }
  let repeat = -1;
  for (let i = 0; i < bytes.length - 16; i++) {
    if (
      new TextDecoder().decode(bytes.slice(i, i + 11)) === "NETSCAPE2.0" &&
      bytes[i + 11] === 3 &&
      bytes[i + 12] === 1
    ) {
      repeat = bytes[i + 13] + 256 * bytes[i + 14];
      break;
    }
  }
  return { width, height, repeat, frames };
}
export function transformFrames(
  animation,
  {
    indices,
    delays,
    repeat = animation.repeat,
    width = animation.width,
    height = animation.height,
    crop,
    step = 1,
  } = {},
  onProgress = () => {},
) {
  width = Number(width);
  height = Number(height);
  step = Number(step);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    !Number.isInteger(step) ||
    step < 1 ||
    step > 300
  )
    throw new Error("Invalid dimensions or frame step");
  const ids = indices || animation.frames.map((_, i) => i);
  if (
    !ids.length ||
    ids.length > 300 ||
    width * height * ids.length > MAX_PIXELS
  )
    throw new Error("GIF exceeds frame or pixel limits");
  const rect = crop || {
    x: 0,
    y: 0,
    width: animation.width,
    height: animation.height,
  };
  if (
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 1 ||
    rect.height < 1 ||
    rect.x + rect.width > animation.width ||
    rect.y + rect.height > animation.height
  )
    throw new Error("Invalid crop rectangle");
  const frames = [];
  for (let at = 0; at < ids.length; at += step) {
    const id = ids[at],
      original = animation.frames[id];
    if (!original) throw new Error("Invalid frame index");
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const sx =
            rect.x +
            Math.min(rect.width - 1, Math.floor((x * rect.width) / width)),
          sy =
            rect.y +
            Math.min(rect.height - 1, Math.floor((y * rect.height) / height));
        data.set(
          original.data.subarray(
            (sy * animation.width + sx) * 4,
            (sy * animation.width + sx) * 4 + 4,
          ),
          (y * width + x) * 4,
        );
      }
    let delay = 0;
    for (let i = at; i < Math.min(at + step, ids.length); i++) {
      const next = animation.frames[ids[i]];
      if (!next) throw new Error("Invalid frame index");
      const ms = Number(delays?.[i] ?? next.delay);
      if (!Number.isFinite(ms) || ms < 0 || ms > 655350)
        throw new Error("Invalid frame delay");
      delay += ms;
    }
    if (delay > 655350)
      throw new Error("Frame duration exceeds GIF format limit");
    frames.push({ data, delay });
    onProgress({ stage: "transform", progress: Math.min(1, (at + step) / ids.length) });
  }
  return { width, height, repeat, frames };
}
export function encodeAnimation(animation, colors = 128, onProgress = () => {}) {
  if (!Number.isInteger(colors) || colors < 2 || colors > 256)
    throw new Error("Colors must be between 2 and 256");
  if (
    !Number.isInteger(animation.repeat) ||
    animation.repeat < -1 ||
    animation.repeat > 65535
  )
    throw new Error("Invalid repeat count");
  const gif = GIFEncoder();
  for (const [frameIndex, frame] of animation.frames.entries()) {
    const palette = quantize(frame.data, colors, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const index = applyPalette(frame.data, palette, "rgba4444");
    const transparentIndex = palette.findIndex((p) => p[3] === 0);
    gif.writeFrame(index, animation.width, animation.height, {
      palette: palette.map((p) => p.slice(0, 3)),
      delay: frame.delay,
      repeat: animation.repeat,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: 2,
    });
    onProgress({ stage: "encode", progress: (frameIndex + 1) / animation.frames.length });
  }
  gif.finish();
  return gif.bytes();
}
