import test from "node:test";
import assert from "node:assert/strict";
import { uploadNativePdfs, processNativePdf, inspectNativePdfs, cancelNativePdf } from "../src/lib/nativePdf.js";
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("upload abort during session creation cleans the late session without sending bytes", async () => {
  const previous = globalThis.window, controller = new AbortController();
  const calls = [];
  globalThis.window = { dbxPlugin: { ready: Promise.resolve(), async invoke(method) {
    calls.push(method);
    if (method.endsWith("begin")) { controller.abort(); return { sessionId: "late", channel: "toolbox/pdf/late" }; }
    return {};
  }, async sendBinary() { assert.fail("Aborted bytes must not be sent"); } } };
  try {
    await assert.rejects(uploadNativePdfs([new File(["pdf"], "input.pdf")], { signal: controller.signal }), { name: "AbortError" });
    await tick();
    assert.ok(calls.includes("toolbox/pdf/cancel"));
  } finally { globalThis.window = previous; }
});

test("native PDF timeout observes completion without duplicating the operation", async () => {
  const previous = globalThis.window;
  let processCalls = 0, progress;
  globalThis.window = { dbxPlugin: { ready: Promise.resolve(), async invoke(method) {
    if (method.endsWith("process")) { processCalls++; throw Object.assign(new Error("Timed out"), { code: "TIMEOUT" }); }
    if (method.endsWith("status")) return { processing: false, progress: { stage: "write", completed: 1, total: 1 }, result: { name: "output.pdf", size: 42 } };
  } } };
  try {
    assert.equal((await processNativePdf("session", "merge", {}, { onProgress: (value) => progress = value })).size, 42);
    assert.equal(processCalls, 1);
    assert.equal(progress.stage, "write");
  } finally { globalThis.window = previous; }
});

test("inspection can recover from a host timeout as well", async () => {
  const previous = globalThis.window;
  globalThis.window = { dbxPlugin: { ready: Promise.resolve(), async invoke(method) {
    if (method.endsWith("inspect")) throw Object.assign(new Error("Timed out"), { code: "TIMEOUT" });
    return { processing: false, result: { count: 3, files: [] } };
  } } };
  try { assert.equal((await inspectNativePdfs("session")).count, 3); }
  finally { globalThis.window = previous; }
});

test("native cancellation sends one request and rejects late output", async () => {
  const previous = globalThis.window, controller = new AbortController();
  let done, started = false, cancellations = 0;
  globalThis.window = { dbxPlugin: { ready: Promise.resolve(), async invoke(method) {
    if (method.endsWith("process")) { started = true; return new Promise((resolve) => done = resolve); }
    if (method.endsWith("cancel")) { cancellations++; return { cancelling: true }; }
    return { processing: true };
  } } };
  try {
    const work = processNativePdf("session", "rotate", {}, { signal: controller.signal });
    const rejected = assert.rejects(work, { name: "AbortError" });
    while (!started) await tick();
    controller.abort();
    await tick();
    assert.equal(cancellations, 1);
    done({ size: 123 });
    await rejected;
    await cancelNativePdf("");
  } finally { globalThis.window = previous; }
});
