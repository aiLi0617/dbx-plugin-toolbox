import { invoke, ready, sendBinary } from "./host.js";

export const OCR_CHUNK_BYTES = 4 * 1024 * 1024;

function abortError() {
  return Object.assign(new DOMException("OCR recognition was cancelled", "AbortError"), { code: "OCR_CANCELLED" });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

export function splitOcrBytes(bytes, chunkBytes = OCR_CHUNK_BYTES) {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(chunkBytes) || chunkBytes < 1) {
    throw new TypeError("OCR bytes and chunk size are invalid");
  }
  const chunks = [];
  for (let start = 0; start < bytes.byteLength; start += chunkBytes) {
    chunks.push(bytes.subarray(start, Math.min(bytes.byteLength, start + chunkBytes)));
  }
  return chunks;
}

export function ocrBinaryChannel(base, chunkIndex) {
  if (!base || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0) throw new TypeError("OCR channel is invalid");
  return `${base}/${chunkIndex}`;
}

function eventPayload(event) {
  if (event?.method === "toolbox/ocr/progress") return event.params || {};
  if (event?.type === "toolbox/ocr/progress") return event.detail || event.params || {};
  return null;
}

function modelEventPayload(event) {
  if (event?.method === "toolbox/ocr/models/progress") return event.params || {};
  if (event?.type === "toolbox/ocr/models/progress") return event.detail || event.params || {};
  return null;
}

export async function getOcrModelStatus() {
  await ready();
  return invoke("toolbox/ocr/models/status");
}

export async function installOcrModels(tier, options = {}) {
  const { onProgress = () => {} } = options;
  await ready();
  let sessionId = "";
  let settle;
  const completion = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const offEvent = window.dbxPlugin?.onEvent?.((event) => {
    const payload = modelEventPayload(event);
    if (!payload || !sessionId || payload.sessionId !== sessionId) return;
    onProgress(payload);
    if (payload.stage === "complete") settle.resolve(payload);
    if (payload.stage === "cancelled") settle.reject(abortError());
    if (payload.stage === "error") settle.reject(new Error(payload.error || "OCR model download failed"));
  });
  try {
    const started = await invoke("toolbox/ocr/models/install", { tier });
    if (started.installed) return started;
    sessionId = started.sessionId;
    onProgress({ sessionId, tier, stage: "starting", progress: 0 });
    const status = await getOcrModelStatus();
    if ((tier === "base" && status.base?.installed) || (tier === "accurate" && status.accurate?.installed)) {
      return { sessionId, tier, stage: "complete" };
    }
    return await completion;
  } finally {
    if (typeof offEvent === "function") offEvent();
  }
}

export async function cancelOcrModelInstall(sessionId) {
  if (!sessionId) return;
  await invoke("toolbox/ocr/models/cancel", { sessionId });
}

export async function removeOcrModels(tier) {
  return invoke("toolbox/ocr/models/remove", { tier });
}

async function waitForChunks(sessionId, expected, signal) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const status = await invoke("toolbox/ocr/status", { sessionId });
    if (status.receivedChunks >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("Timed out while transferring the image to the native OCR engine");
}

export async function recognizeNativeOcr(file, options = {}) {
  const { region, quality = "auto", enhance = false, layout = true, smartCorrection = true, onProgress = () => {}, signal } = options;
  throwIfAborted(signal);
  await ready();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunks = splitOcrBytes(bytes);
  const chunkCount = chunks.length;
  const begin = await invoke("toolbox/ocr/begin", { byteLength: bytes.byteLength, chunkCount });
  const sessionId = begin.sessionId;
  const cancel = () => { void invoke("toolbox/ocr/cancel", { sessionId }).catch(() => {}); };
  let completed = false;
  signal?.addEventListener("abort", cancel, { once: true });

  const offEvent = window.dbxPlugin?.onEvent?.((event) => {
    const payload = eventPayload(event);
    if (!payload || payload.sessionId !== sessionId) return;
    onProgress({ stage: payload.stage, progress: 25 + Math.round(Number(payload.progress || 0) * 75) });
  });

  try {
    for (let index = 0; index < chunkCount; index += 1) {
      throwIfAborted(signal);
      await sendBinary(ocrBinaryChannel(begin.channel, index), chunks[index]);
      await waitForChunks(sessionId, index + 1, signal);
      onProgress({ stage: "upload", progress: Math.round(((index + 1) / chunkCount) * 25) });
    }
    throwIfAborted(signal);
    const result = await invoke("toolbox/ocr/recognize", { sessionId, region, quality, enhance, layout, smartCorrection }, 120_000);
    completed = true;
    return result;
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (typeof offEvent === "function") offEvent();
    if (!completed) cancel();
  }
}
