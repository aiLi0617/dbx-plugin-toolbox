import test from "node:test";
import assert from "node:assert/strict";
import { bytesEqual, classifyMd5Comparison } from "../src/lib/collision.js";
import { extensionMatches, identifyFileType } from "../src/lib/fileType.js";
import { LARGE_DATA_URL_CHARS, base64EncodedLength, compressionRatio, dataUrlParts, gridSlices, imageDataUrlLength } from "../src/lib/imageUtility.js";
import { saveBlobThroughHost } from "../src/lib/fileSave.js";
import { copyText } from "../src/lib/clipboard.js";

test("MD5 comparison only calls different bytes with equal digests a collision", () => {
  assert.equal(classifyMd5Comparison("same", "same", false), "collision");
  assert.equal(classifyMd5Comparison("same", "same", true), "identical");
  assert.equal(classifyMd5Comparison("left", "right", false), "different-hash");
  assert.equal(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
});

test("file type identification uses signatures and reports extension mismatches", () => {
  const png = identifyFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(png.mime, "image/png");
  assert.equal(extensionMatches(png, "photo.png"), true);
  assert.equal(extensionMatches(png, "photo.jpg"), false);
  assert.equal(identifyFileType(new TextEncoder().encode('{"ok":true}')).mime, "application/json");
});

test("grid slices cover odd dimensions without gaps", () => {
  const slices = gridSlices(10, 7, 2, 3);
  assert.equal(slices.length, 6);
  assert.equal(slices.filter((item) => item.row === 1).reduce((sum, item) => sum + item.width, 0), 10);
  assert.equal(slices.filter((item) => item.column === 1).reduce((sum, item) => sum + item.height, 0), 7);
  assert.deepEqual(slices.at(-1), { row: 2, column: 3, x: 7, y: 4, width: 3, height: 3 });
});

test("image utility helpers parse Data URLs and compare compression size", () => {
  assert.deepEqual(dataUrlParts("data:image/png;base64,AA=="), { mime: "image/png", base64: "AA==" });
  assert.equal(compressionRatio(1000, 725), 27.5);
  assert.equal(compressionRatio(1000, 1100), -10);
});

test("image utility estimates large Base64 output without materializing it", () => {
  assert.equal(base64EncodedLength(0), 0);
  assert.equal(base64EncodedLength(1), 4);
  assert.equal(base64EncodedLength(3), 4);
  assert.equal(imageDataUrlLength(3, "image/png"), "data:image/png;base64,".length + 4);
  assert.ok(imageDataUrlLength(1.86 * 1024 * 1024, "image/png") > LARGE_DATA_URL_CHARS);
});

test("large clipboard text uses the async API without truncation", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const payload = `data:image/png;base64,${"a".repeat(2_500_000)}`;
  let copied = "";
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { async writeText(value) { copied = value; } } },
  });
  try {
    await copyText(payload);
    assert.equal(copied.length, payload.length);
    assert.equal(copied, payload);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
});

test("large file saves stay below the bridge limit by streaming chunks", async () => {
  const previousWindow = globalThis.window;
  const chunks = [];
  globalThis.window = {
    dbxPlugin: {
      ready: Promise.resolve(),
      async invoke(method, params) {
        if (method === "toolbox/save-file-stream/begin") {
          assert.equal(params.size, 700_000);
          return { sessionId: "save-session" };
        }
        if (method === "toolbox/save-file-stream/update") {
          assert.equal(params.sessionId, "save-session");
          assert.ok(JSON.stringify(params).length < 2 * 1024 * 1024);
          chunks.push(Buffer.from(params.dataBase64, "base64"));
          return { ok: true };
        }
        if (method === "toolbox/save-file-stream/finalize") return { path: "saved.zip" };
        throw new Error(`Unexpected method: ${method}`);
      },
    },
  };
  try {
    const blob = new Blob([new Uint8Array(700_000).fill(0x61)], { type: "application/zip" });
    const saved = await saveBlobThroughHost(blob, { fileName: "slices.zip", binary: true });
    assert.equal(saved.path, "saved.zip");
    assert.equal(Buffer.concat(chunks).length, blob.size);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 256 * 1024));
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
