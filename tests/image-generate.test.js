import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFileName,
  buildFormatsZip,
  clampGenerateSize,
  humanFileSize,
  OUTPUT_FORMATS,
  PROCESS_OUTPUT_FORMATS,
  padImageToSize,
  padJpegToSize,
  padPngToSize,
  padWebpToSize,
  parseTargetBytes,
  resolveOutputFormat,
  sanitizeFileBase,
} from "../src/lib/imageGenerate.js";
import { padBmpToSize, padGifToSize, padSvgToSize } from "../src/lib/imageEncodeExtra.js";
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from "../src/lib/imageOps.js";
import { buildZipStore } from "../src/lib/zipStore.js";

function minimalPng() {
  return Uint8Array.from(Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ));
}

function minimalJpeg() {
  return Uint8Array.from(Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z",
    "base64",
  ));
}

function minimalWebp() {
  // Tiny lossy 1x1 WebP
  return Uint8Array.from(Buffer.from(
    "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
    "base64",
  ));
}

test("parses target size with B / KB / MB units", () => {
  assert.equal(parseTargetBytes(128, "B"), 128);
  assert.equal(parseTargetBytes(2.5, "KB"), 2560);
  assert.equal(parseTargetBytes(1, "MB"), 1024 * 1024);
  assert.throws(() => parseTargetBytes(10, "B"), /at least/);
  assert.throws(() => parseTargetBytes(100, "MB"), /50 MB/);
});

test("lists common raster and vector output formats", () => {
  const extensions = OUTPUT_FORMATS.filter((item) => !item.optional).map((item) => item.extension);
  assert.deepEqual(extensions, ["png", "jpg", "gif", "webp", "bmp", "svg", "ico", "tiff"]);
  assert.equal(resolveOutputFormat("image/x-icon").label, "ICO");
  assert.equal(resolveOutputFormat("image/tiff").extension, "tiff");
});

test("process export formats mirror import raster types", () => {
  const mimes = PROCESS_OUTPUT_FORMATS.map((item) => item.mime);
  assert.deepEqual(mimes, [
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif",
  ]);
});

test("pads PNG to an exact byte length with a private chunk", () => {
  const source = minimalPng();
  const target = source.length + 64;
  const padded = padPngToSize(source, target);
  assert.equal(padded.length, target);
  assert.equal(padded[0], 0x89);
  assert.deepEqual([...padded.slice(-8)], [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
});

test("pads JPEG to an exact byte length with COM markers", () => {
  const source = minimalJpeg();
  const target = source.length + 100;
  const padded = padJpegToSize(source, target);
  assert.equal(padded.length, target);
  assert.equal(padded[0], 0xff);
  assert.equal(padded[padded.length - 1], 0xd9);
});

test("pads WebP to an exact byte length with a RIFF chunk", () => {
  const source = minimalWebp();
  assert.equal(String.fromCharCode(...source.slice(0, 4)), "RIFF");
  const target = source.length + 32;
  const padded = padWebpToSize(source, target);
  assert.equal(padded.length, target);
  assert.equal(String.fromCharCode(...padded.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...padded.slice(8, 12)), "WEBP");
  const riffSize = padded[4] | (padded[5] << 8) | (padded[6] << 16) | (padded[7] << 24);
  assert.equal(riffSize, target - 8);
});

test("routes padding by mime type", () => {
  const png = minimalPng();
  const jpeg = minimalJpeg();
  const webp = minimalWebp();
  assert.equal(padImageToSize(png, png.length + 32, "image/png").length, png.length + 32);
  assert.equal(padImageToSize(jpeg, jpeg.length + 32, "image/jpeg").length, jpeg.length + 32);
  assert.equal(padImageToSize(webp, webp.length + 32, "image/webp").length, webp.length + 32);
});

test("clamps generate dimensions to side and megapixel caps", () => {
  const side = clampGenerateSize(20_000, 100);
  assert.equal(side.width, MAX_IMAGE_SIDE);
  assert.equal(side.height, 100);
  assert.equal(side.dimensionAdjusted, true);

  const mega = clampGenerateSize(10_000, 10_000);
  assert.ok(mega.width * mega.height <= MAX_IMAGE_PIXELS);
  assert.equal(mega.dimensionAdjusted, true);
  assert.equal(mega.requestedWidth, 10_000);
  assert.equal(mega.requestedHeight, 10_000);

  const ok = clampGenerateSize(800, 600);
  assert.deepEqual(
    { width: ok.width, height: ok.height, dimensionAdjusted: ok.dimensionAdjusted },
    { width: 800, height: 600, dimensionAdjusted: false },
  );
});

test("sanitizes file names and builds download names", () => {
  assert.equal(sanitizeFileBase('a/b:c*.png'), "a_b_c_");
  assert.equal(sanitizeFileBase("  hello world  "), "hello-world");
  assert.equal(buildFileName("demo.png", "jpg", { width: 800, height: 600 }), "demo.jpg");
  assert.equal(buildFileName("", "png", { width: 10, height: 20 }), "placeholder-10x20.png");
});

test("builds a store-only zip for multiple formats", () => {
  const zip = buildZipStore([
    { name: "a.png", bytes: new Uint8Array([1, 2, 3]) },
    { name: "b.jpg", bytes: new Uint8Array([4, 5]) },
  ]);
  assert.equal(String.fromCharCode(zip[0], zip[1], zip[2], zip[3]), "PK\u0003\u0004");
  const packed = buildFormatsZip([
    { extension: "png", bytes: new Uint8Array([9, 9]) },
    { extension: "bmp", bytes: new Uint8Array([8]) },
  ], "demo");
  assert.equal(packed.fileName, "demo-images.zip");
  assert.equal(packed.mime, "application/zip");
  assert.equal(packed.count, 2);
});

test("pads BMP GIF and SVG to an exact byte length", () => {
  const bmp = new Uint8Array(54);
  bmp[0] = 0x42;
  bmp[1] = 0x4d;
  const paddedBmp = padBmpToSize(bmp, 120);
  assert.equal(paddedBmp.length, 120);
  assert.equal(paddedBmp[2] | (paddedBmp[3] << 8) | (paddedBmp[4] << 16) | (paddedBmp[5] << 24), 120);

  const gif = Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x3b);
  assert.equal(padGifToSize(gif, gif.length + 20).length, gif.length + 20);

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal(padSvgToSize(svg, svg.length + 40).length, svg.length + 40);
});

test("formats human-readable file sizes", () => {
  assert.equal(humanFileSize(0), "0 B");
  assert.equal(humanFileSize(512), "512 B");
  assert.equal(humanFileSize(2048), "2.0 KB");
});
