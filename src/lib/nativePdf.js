import { invoke, ready, sendBinary } from "./host.js";

export const PDF_NATIVE_OPERATIONS = new Set([
  "merge",
  "split",
  "rotate",
  "delete",
  "extract",
  "crop",
  "compress",
  "encrypt",
  "decrypt",
]);

const DEFAULT_CHUNK_BYTES = 4 * 1024 * 1024;

function abortError() {
  const error = new Error("PDF processing was cancelled");
  error.name = "AbortError";
  error.code = "PDF_CANCELLED";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

async function waitForFile(sessionId, fileIndex, expectedChunks, signal) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const status = await invoke("toolbox/pdf/status", { sessionId });
    if (Number(status?.files?.[fileIndex]?.receivedChunks) >= expectedChunks)
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out while transferring the PDF to the Sidecar");
}

export async function uploadNativePdfs(
  files,
  { signal, onProgress = () => {} } = {},
) {
  throwIfAborted(signal);
  await ready();
  throwIfAborted(signal);
  const declared = files.map((file) => ({
    name: file.name,
    size: file.size,
    chunkCount: Math.ceil(file.size / DEFAULT_CHUNK_BYTES),
  }));
  const begin = await invoke("toolbox/pdf/begin", { files: declared }, 120_000);
  const sessionId = begin.sessionId;
  const chunkBytes = Number(begin.chunkBytes) || DEFAULT_CHUNK_BYTES;
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let uploaded = 0;
  const cancel = () => { void cancelNativePdf(sessionId); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    throwIfAborted(signal);
    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const chunks = Math.ceil(file.size / chunkBytes);
      for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
        throwIfAborted(signal);
        const start = chunkIndex * chunkBytes;
        const data = await file
          .slice(start, Math.min(file.size, start + chunkBytes))
          .arrayBuffer();
        throwIfAborted(signal);
        await sendBinary(`${begin.channel}/${fileIndex}/${chunkIndex}`, data);
        uploaded += data.byteLength;
        onProgress({
          stage: "upload",
          uploadedBytes: uploaded,
          totalBytes: total,
          progress: total ? uploaded / total : 1,
        });
      }
      await waitForFile(sessionId, fileIndex, chunks, signal);
    }
    throwIfAborted(signal);
    return sessionId;
  } catch (error) {
    void invoke("toolbox/pdf/cancel", { sessionId }).catch(() => {});
    throw signal?.aborted ? abortError() : error;
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
}

// Observe long-running RPCs without issuing the operation twice on host timeout.
export async function runNativePdfRequest(method, params, { signal, onProgress = () => {} } = {}) {
  throwIfAborted(signal);
  let settled = false, timedOut = false;
  const cancel = () => { void cancelNativePdf(params.sessionId); };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    return await new Promise((resolve, reject) => {
      const complete = (result) => signal?.aborted ? reject(abortError()) : resolve(result);
      void invoke(method, params, 120_000).then(complete, (error) => {
        if (signal?.aborted) reject(abortError());
        else if (error?.code === "TIMEOUT") timedOut = true;
        else reject(error);
      });
      void (async () => {
        const deadline = Date.now() + 30 * 60_000;
        while (!settled) {
          await new Promise((next) => setTimeout(next, 500));
          if (settled) return;
          try {
            const status = await invoke("toolbox/pdf/status", { sessionId: params.sessionId }, 10_000);
            if (settled) return;
            if (!signal?.aborted && status.progress) onProgress(status.progress);
            if (timedOut && !status.processing) {
              if (status.error) reject(Object.assign(new Error(status.error.message), { code: status.error.code }));
              else if (status.result) complete(status.result);
              else reject(new Error("PDF output is not ready"));
              return;
            }
            if (signal?.aborted && !status.processing) { reject(abortError()); return; }
          } catch (error) {
            if (signal?.aborted && /PDF session was not found/.test(error?.message || "")) { reject(abortError()); return; }
            if (timedOut) { reject(error); return; }
          }
          if (Date.now() >= deadline) { cancel(); reject(new Error("PDF processing timed out")); return; }
        }
      })().catch(reject);
    });
  } finally {
    settled = true;
    signal?.removeEventListener("abort", cancel);
  }
}

export function inspectNativePdfs(sessionId, password = "", task = {}) {
  return runNativePdfRequest("toolbox/pdf/inspect", { sessionId, password }, task);
}

export function processNativePdf(sessionId, operation, options, task = {}) {
  return runNativePdfRequest("toolbox/pdf/process", { sessionId, operation, ...options }, task);
}

export function saveNativePdf(sessionId, fileName) {
  return invoke("toolbox/pdf/save", { sessionId, fileName }, 120_000);
}

export function cancelNativePdf(sessionId) {
  if (!sessionId) return Promise.resolve();
  return invoke("toolbox/pdf/cancel", { sessionId }).catch(() => {});
}
