import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { once } from "node:events";
import * as bridge from "../src/lib/nativePdf.js";
import { validatePdfFiles } from "../src/lib/pdfTools.js";
import { createTaskScope } from "../src/lib/taskManager.js";

function fixture() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>", ...Array(3).fill("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>")];
  let pdf = "%PDF-1.5\n", offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new File([pdf], "sample.pdf", { type: "application/pdf" });
}

function connect(binary) {
  const child = spawn(binary, [], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let sequence = 0, buffered = Buffer.alloc(0);
  const pending = new Map();
  function fail(error) { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); }
  child.on("error", fail);
  child.on("exit", (code) => fail(new Error(`Sidecar exited: ${code}`)));
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 5 && buffered.length >= 5 + buffered.readUInt32BE(1)) {
      const length = buffered.readUInt32BE(1), kind = buffered[0], payload = buffered.subarray(5, 5 + length);
      buffered = buffered.subarray(5 + length);
      if (kind !== 0) continue;
      const response = JSON.parse(payload), task = pending.get(response.id);
      if (!task) continue;
      pending.delete(response.id); clearTimeout(task.timer);
      if (response.error) task.reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
      else task.resolve(response.result);
    }
  });
  function write(kind, payload) {
    const header = Buffer.alloc(5); header[0] = kind; header.writeUInt32BE(payload.length, 1);
    return new Promise((resolve, reject) => child.stdin.write(Buffer.concat([header, payload]), (error) => error ? reject(error) : resolve()));
  }
  return {
    ready: Promise.resolve(),
    invoke(method, params = {}, { timeoutMs = 30_000 } = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        void write(0, Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params: structuredClone(params) }))).catch(fail);
      });
    },
    async sendBinary(channel, data) {
      const name = Buffer.from(channel), size = Buffer.alloc(2); size.writeUInt16BE(name.length);
      await write(1, Buffer.concat([size, name, Buffer.from(data)]));
    },
    async close() { const exited = once(child, "exit"); child.kill(); await exited; },
  };
}

test("actual PDF view handlers cross the binary bridge to the Rust Sidecar for all native operations", { skip: !process.env.TOOLBOX_SIDECAR, timeout: 120_000 }, async () => {
  const host = connect(process.env.TOOLBOX_SIDECAR), previous = globalThis.window;
  globalThis.window = { dbxPlugin: host };
  const source = readFileSync(new URL("../src/lib/PdfToolView.svelte", import.meta.url), "utf8");
  const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  const code = section("  function clearOutput()", "  async function clearPreview()") + section("  async function load()", "  function setPagePreset") + section("  async function run()", "  async function save()") + section("  function resultName()", "</script>");
  try {
    await host.invoke("plugin/initialize", { host: { protocolVersions: [1] } });
    for (const operation of bridge.PDF_NATIVE_OPERATIONS) {
      const scope = createTaskScope(`pdf-${operation}`, "pdf");
      const state = {
        ...bridge, validatePdfFiles, operation, nativeOperation: true, nativeSession: "", files: operation === "merge" ? [fixture(), fixture()] : [fixture()],
        info: null, order: [], buffers: [], thumbs: [], report: "", output: null, busy: false, error: "", progress: "", password: "", newPassword: "test-password", pages: "1-2", angle: 90, top: 5, bottom: 5, left: 5, right: 5,
        revision: 0, disposed: false, locale: "en", pageRangeState: { error: "" },
        formatBytes: String, t: (_, en) => en, localizeError: (_, error) => error.message,
        clearPreview: async () => {}, managed: (work) => scope.run((task) => work(task, {})),
      };
      vm.createContext(state); vm.runInContext(code, state);
      try {
        await vm.runInContext("load()", state);
        assert.equal(state.error, "", `${operation}: load`);
        assert.equal(state.info.count, operation === "merge" ? 6 : 3);
        const uploadedId = state.nativeSession;
        state.order = new Proxy(state.order, {});
        await vm.runInContext("clearOutput(); run()", state);
        assert.equal(state.error, "", `${operation}: process`);
        assert.equal(state.nativeSession, uploadedId, `${operation}: output invalidation must retain the upload`);
        assert.ok(state.output.native && state.output.size > 0, operation);
        // Repeating processing exercises session reuse without re-uploading.
        await vm.runInContext("run()", state);
        assert.equal(state.error, "", `${operation}: repeat`);
      } finally { scope.dispose(); await bridge.cancelNativePdf(state.nativeSession); }
    }
  } finally { globalThis.window = previous; await host.close(); }
});
