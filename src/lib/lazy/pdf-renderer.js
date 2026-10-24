import { getDocument, PDFWorker } from "pdfjs-dist/build/pdf.mjs";
import workerSource from "pdfjs-dist/build/pdf.worker.mjs?raw";
export async function openPdfRenderer(bytes, password = "", { signal } = {}) {
  // DBX frames have an opaque origin. A classic self-contained worker avoids
  // module-worker origin checks; PDF.js only exports this one worker handler.
  const source = workerSource
    .replaceAll("import.meta.url", "self.location.href")
    .replace(/export\s*\{\s*WorkerMessageHandler\s*\};/, "");
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  let port;
  try {
    port = new Worker(url);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  const worker = new PDFWorker({ port });
  let task, timer, abort;
  const failed = new Promise((_, reject) => {
    abort = () => reject(Object.assign(new Error("Cancelled"), { name: "AbortError" }));
    signal?.addEventListener("abort", abort, { once: true });
    port.onerror = () => reject(new Error("PDF rendering worker failed"));
    timer = setTimeout(
      () => reject(new Error("PDF renderer startup timed out")),
      20_000,
    );
  });
  try {
    task = getDocument({
      data: bytes.slice(),
      password,
      worker,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: false,
      maxImageSize: 16_000_000,
      enableXfa: false,
      useWasm: false,
    });
    if (signal?.aborted) abort();
    const doc = await Promise.race([task.promise, failed]);
    clearTimeout(timer);
    return {
      count: doc.numPages,
      async render(index, canvas, scale = 0.3) {
        if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
          throw new Error(
            "Render scale must be greater than zero and at most 4",
          );
        const page = await doc.getPage(index + 1);
        let viewport = page.getViewport({ scale });
        if (viewport.width * viewport.height > 8_000_000)
          throw new Error("Rendered page exceeds pixel limit");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        page.cleanup();
      },
      async destroy() {
        await task.destroy();
        worker.destroy();
        port.terminate();
        URL.revokeObjectURL(url);
      },
    };
  } catch (e) {
    clearTimeout(timer);
    worker.destroy();
    port.terminate();
    URL.revokeObjectURL(url);
    void task?.destroy().catch(() => {});
    throw e;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
