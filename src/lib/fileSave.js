import { toBase64 } from "./codec.js";
import { invoke } from "./host.js";

const SAVE_CHUNK_BYTES = 256 * 1024;

/** Upload a Blob to the sidecar without exceeding the Host Bridge JSON limit. */
export async function saveBlobThroughHost(blob, options, timeoutMs = 120000) {
  if (!(blob instanceof Blob) || blob.size <= 0) throw new Error("File is empty");
  const begin = await invoke("toolbox/save-file-stream/begin", {
    fileName: options.fileName,
    mimeType: options.mimeType || blob.type || "application/octet-stream",
    extension: options.extension,
    title: options.title,
    binary: Boolean(options.binary),
    size: blob.size,
  }, timeoutMs);
  const sessionId = begin?.sessionId;
  if (!sessionId) throw new Error("Could not start file transfer");

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    for (let offset = 0; offset < bytes.length; offset += SAVE_CHUNK_BYTES) {
      await invoke("toolbox/save-file-stream/update", {
        sessionId,
        dataBase64: toBase64(bytes.subarray(offset, offset + SAVE_CHUNK_BYTES)),
      }, timeoutMs);
    }
    return await invoke("toolbox/save-file-stream/finalize", { sessionId }, timeoutMs);
  } catch (error) {
    try {
      await invoke("toolbox/save-file-stream/cancel", { sessionId }, timeoutMs);
    } catch {
      // Preserve the transfer failure; cleanup is best effort and sessions expire server-side.
    }
    throw error;
  }
}
