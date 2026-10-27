// Asset URLs are supplied by the host bridge; no network or relative imports.
const modules = new Map();
async function library(url) {
  if (!modules.has(url)) modules.set(url, import(/* @vite-ignore */ url));
  return modules.get(url);
}
self.onmessage = async ({ data }) => {
  try {
    const lib = await library(data.url);
    let result;
    if (data.action === "inspect") result = await lib.inspectPdf(...data.args);
    else if (data.action === "process") result = await lib.processPdf(...data.args);
    else if (data.action === "signatures") {
      const entries = await lib.pdfSignatureData(...data.args);
      const crypto = await library(data.signaturesUrl);
      result = [];
      for (const entry of entries) result.push(await crypto.inspectSignature(entry));
    } else throw new Error("Unknown PDF worker operation");
    const transfer = Array.isArray(result) ? result.filter((item) => item instanceof Uint8Array).map((item) => item.buffer) : [];
    self.postMessage({ result }, transfer);
  } catch (error) {
    self.postMessage({ error: { message: error.message, name: error.name } });
  }
};
