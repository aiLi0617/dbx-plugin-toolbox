import assert from "node:assert/strict";
import test from "node:test";
import { installOcrModels, OCR_CHUNK_BYTES, ocrBinaryChannel, splitOcrBytes } from "../src/lib/nativeOcr.js";

test("native OCR splits images below the DBX binary frame limit", () => {
  const bytes = new Uint8Array(OCR_CHUNK_BYTES * 2 + 3);
  const chunks = splitOcrBytes(bytes);
  assert.deepEqual(chunks.map((chunk) => chunk.byteLength), [OCR_CHUNK_BYTES, OCR_CHUNK_BYTES, 3]);
  assert.ok(chunks.every((chunk) => chunk.byteLength < 8 * 1024 * 1024));
});

test("native OCR splits the maximum accepted image into five upload chunks", () => {
  const chunks = splitOcrBytes(new Uint8Array(20_000_000));
  assert.equal(chunks.length, 5);
  assert.equal(chunks.reduce((total, chunk) => total + chunk.byteLength, 0), 20_000_000);
});

test("native OCR uses stable per-session chunk channels", () => {
  assert.equal(ocrBinaryChannel("toolbox/ocr/session", 2), "toolbox/ocr/session/2");
  assert.throws(() => ocrBinaryChannel("toolbox/ocr/session", -1), TypeError);
});

test("OCR model installation stops waiting immediately when locally cancelled", async () => {
  const previousWindow = globalThis.window;
  let eventListener;
  let unsubscribed = false;
  globalThis.window = {
    dbxPlugin: {
      ready: Promise.resolve(),
      onEvent(listener) {
        eventListener = listener;
        return () => { unsubscribed = true; };
      },
      async invoke(method) {
        if (method === "toolbox/ocr/models/install") return { started: true, sessionId: "model-session", tier: "base" };
        if (method === "toolbox/ocr/models/status") return new Promise(() => {});
        throw new Error(`Unexpected method: ${method}`);
      },
    },
  };
  const controller = new AbortController();
  let started = false;
  try {
    const installing = installOcrModels("base", {
      signal: controller.signal,
      onProgress(update) { if (update.stage === "starting") started = true; },
    });
    while (!started) await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(installing, (error) => error?.name === "AbortError");
    assert.equal(typeof eventListener, "function");
    assert.equal(unsubscribed, true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("OCR model cancellation while creating a session releases the late download", async () => {
  const previousWindow = globalThis.window, controller = new AbortController();
  const cancelled = [];
  globalThis.window = { dbxPlugin: {
    ready: Promise.resolve(), onEvent() { return () => {}; },
    async invoke(method, params) {
      if (method.endsWith("install")) { controller.abort(); return { sessionId: "late-model" }; }
      if (method.endsWith("cancel")) { cancelled.push(params.sessionId); return {}; }
      throw new Error(`Unexpected method: ${method}`);
    },
  } };
  try {
    await assert.rejects(installOcrModels("base", { signal: controller.signal }), { name: "AbortError" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(cancelled, ["late-model"]);
  } finally { globalThis.window = previousWindow; }
});
