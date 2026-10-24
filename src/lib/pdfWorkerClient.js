import PdfWorker from "./pdfTaskWorker.js?worker&inline";
import { ready } from "./host.js";
import { taskAbortError } from "./taskManager.js";

export function createPdfWorkerClient(signal) {
  let worker, pending, disposed = false;
  const urls = new Map();
  const check = () => { if (disposed || signal?.aborted) throw taskAbortError(); };
  function dispose() {
    disposed = true;
    worker?.terminate();
    pending?.reject(taskAbortError());
    pending = null;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    signal?.removeEventListener("abort", dispose);
  }
  signal?.addEventListener("abort", dispose, { once: true });
  async function asset(name) {
    check();
    if (!urls.has(name)) {
      const url = await window.dbxPlugin.readAssetUrl(`assets/lazy-${name}.js`);
      if (disposed || signal?.aborted) { URL.revokeObjectURL(url); throw taskAbortError(); }
      urls.set(name, url);
    }
    return urls.get(name);
  }
  return {
    async request(action, args) {
      check();
      await ready();
      const url = await asset("pdf-tools");
      const signaturesUrl = action === "signatures" ? await asset("pdf-signatures") : undefined;
      check();
      if (pending) throw new Error("A task is already running");
      if (!worker) {
        worker = new PdfWorker();
        worker.onmessage = ({ data }) => {
          const task = pending;
          pending = null;
          if (!task) return;
          if (data.error) task.reject(Object.assign(new Error(data.error.message), { name: data.error.name }));
          else task.resolve(data.result);
        };
        worker.onerror = () => {
          const task = pending;
          pending = null;
          task?.reject(new Error("PDF rendering worker failed"));
          dispose();
        };
      }
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try { worker.postMessage({ action, args, url, signaturesUrl }); }
        catch (error) { pending = null; reject(error); }
      });
    },
    dispose,
  };
}
