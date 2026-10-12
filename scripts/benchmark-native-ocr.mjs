import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

const [binary, imagePath, quality = "accurate", regionJson = "null", runCountText = "1", enhanceText = "true"] = process.argv.slice(2);
if (!binary || !imagePath) {
  throw new Error("usage: node scripts/benchmark-native-ocr.mjs <sidecar> <image> [quality] [region-json]");
}

const child = spawn(resolve(binary), [], { stdio: ["pipe", "pipe", "inherit"] });
let nextId = 1;
let pending = new Map();
let buffered = Buffer.alloc(0);

child.stdout.on("data", (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  while (buffered.length >= 5) {
    const length = buffered.readUInt32BE(1);
    if (buffered.length < 5 + length) return;
    const kind = buffered[0];
    const payload = buffered.subarray(5, 5 + length);
    buffered = buffered.subarray(5 + length);
    if (kind !== 0) continue;
    const message = JSON.parse(payload.toString("utf8"));
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
  }
});

function jsonFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const frame = Buffer.allocUnsafe(5 + payload.length);
  frame[0] = 0;
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);
  return frame;
}

function binaryFrame(channel, bytes) {
  const channelBytes = Buffer.from(channel);
  const payloadLength = 2 + channelBytes.length + bytes.length;
  const frame = Buffer.allocUnsafe(5 + payloadLength);
  frame[0] = 1;
  frame.writeUInt32BE(payloadLength, 1);
  frame.writeUInt16BE(channelBytes.length, 5);
  channelBytes.copy(frame, 7);
  bytes.copy(frame, 7 + channelBytes.length);
  return frame;
}

function request(method, params) {
  const id = nextId++;
  child.stdin.write(jsonFrame({ jsonrpc: "2.0", id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  await request("plugin/initialize", {
    host: { dbxVersion: "benchmark", hostApiVersion: "1.1.0", protocolVersions: [1] },
    plugin: { id: "io.github.aili0617.toolbox", version: "0.1.2" },
    permissions: ["host.binary", "host.events"],
  });
  const bytes = await readFile(imagePath);
  const results = [];
  for (let run = 0; run < Number(runCountText); run += 1) {
    const started = performance.now();
    const upload = await request("toolbox/ocr/begin", { byteLength: bytes.length, chunkCount: 1 });
    child.stdin.write(binaryFrame(`${upload.channel}/0`, bytes));
    const result = await request("toolbox/ocr/recognize", {
      sessionId: upload.sessionId,
      region: JSON.parse(regionJson),
      quality,
      enhance: enhanceText !== "false",
      layout: true,
      smartCorrection: true,
    });
    results.push({ elapsedMs: Math.round(performance.now() - started), ...result });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  child.stdin.end();
}
