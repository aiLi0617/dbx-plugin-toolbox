export const ASSET_MODULE_NAMES = Object.freeze(["excel", "barcode", "scanner", "sql", "beautify", "script"]);

// Each asset is a self-contained ESM bundle: blob URLs cannot resolve relative
// imports. Cache the promise as well as the module to coalesce concurrent calls.
export function createAssetModuleLoader({ getHost, importModule, revokeUrl }) {
  const pending = new Map();
  return function load(name) {
    if (!ASSET_MODULE_NAMES.includes(name)) return Promise.reject(new Error(`Unknown asset module: ${name}`));
    if (pending.has(name)) return pending.get(name);
    const promise = (async () => {
      const host = getHost();
      if (!host?.readAssetUrl) throw new Error("DBX resource bridge is unavailable");
      await host.ready;
      const url = await host.readAssetUrl(`assets/lazy/${name}.js`);
      try {
        return await importModule(url);
      } finally {
        // No deferred imports remain in these standalone bundles.
        revokeUrl(url);
      }
    })();
    pending.set(name, promise);
    promise.catch(() => { pending.delete(name); });
    return promise;
  };
}

const browserLoader = createAssetModuleLoader({
  getHost: () => globalThis.window?.dbxPlugin,
  importModule: (url) => import(/* @vite-ignore */ url),
  revokeUrl: (url) => URL.revokeObjectURL(url),
});

export function loadAssetModule(name) {
  if (!ASSET_MODULE_NAMES.includes(name)) return Promise.reject(new Error(`Unknown asset module: ${name}`));
  // Node unit tests use the same entry exports without requiring a DBX host.
  // Keep the URL opaque to Vite so these dependencies never enter the UI graph.
  if (typeof window === "undefined") {
    const path = `./lazy/${name}.js`;
    return import(/* @vite-ignore */ new URL(path, import.meta.url).href);
  }
  return browserLoader(name);
}
