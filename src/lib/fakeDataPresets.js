import { validateFakeRowsConfig } from "./fakeData.js";
import { invoke, ready } from "./host.js";

export const FAKE_DATA_PRESET_LIMIT = 10;

const DATABASE = "toolbox.fakeDataPresets";
const STORE = "forms";
const RECORD = "presets";
const RPC_ERRORS = { "-32120": "duplicate", "-32121": "limit", "-32122": "missing", "-32602": "invalid" };

export class FakeDataPresetError extends Error {
  constructor(code, cause) {
    super(code, { cause });
    this.name = "FakeDataPresetError";
    this.code = code;
  }
}

export function validatePresetConfig(draft) {
  if (!Array.isArray(draft?.fields) || !["json", "csv", "tsv", "ndjson"].includes(draft.format) ||
      typeof draft.seed !== "string" || typeof draft.referenceDate !== "string") {
    throw new FakeDataPresetError("invalid");
  }
  const fields = draft.fields.map((field) => {
    if (typeof field?.name !== "string" || typeof field.type !== "string" ||
        !field.options || typeof field.options !== "object" || Array.isArray(field.options)) {
      throw new FakeDataPresetError("invalid");
    }
    return { name: field.name.trim(), type: field.type, options: field.options };
  });
  const config = { fields, count: Number(draft.count), format: draft.format, seed: draft.seed, referenceDate: draft.referenceDate };
  validateFakeRowsConfig(config.count, fields, { referenceDate: config.referenceDate });
  // Preserve the wire shape in both stores and detach the saved options from the editor.
  return JSON.parse(JSON.stringify(config));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function browserOperation(action, params) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, action === "list" ? "readonly" : "readwrite");
      const store = tx.objectStore(STORE);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error);
      const request = store.get(RECORD);
      request.onsuccess = () => {
        try {
          const presets = request.result ?? [];
          if (!Array.isArray(presets) || presets.length > FAKE_DATA_PRESET_LIMIT) throw new FakeDataPresetError("storage");
          result = { presets };
          if (action === "list") return;
          if (action === "create") {
            if (presets.some(({ name }) => name === params.name)) throw new FakeDataPresetError("duplicate");
            if (presets.length >= FAKE_DATA_PRESET_LIMIT) throw new FakeDataPresetError("limit");
            const id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)),
              (byte) => byte.toString(16).padStart(2, "0")).join("");
            presets.push({ id, ...params });
            result.id = id;
          } else {
            const index = presets.findIndex(({ id }) => id === params.id);
            if (index < 0) throw new FakeDataPresetError("missing");
            if (action === "update") presets[index].config = params.config;
            else presets.splice(index, 1);
          }
          store.put(presets, RECORD);
        } catch (cause) {
          failure = cause;
          tx.abort();
        }
      };
    });
  } finally {
    database.close();
  }
}

async function operation(action, params = {}) {
  try {
    await ready();
    const result = typeof window.dbxPlugin?.invoke === "function"
      ? await invoke(`toolbox/fake-data-presets/${action}`, params)
      : await browserOperation(action, params);
    if (!Array.isArray(result?.presets)) throw new FakeDataPresetError("storage");
    return result;
  } catch (cause) {
    if (cause instanceof FakeDataPresetError) throw cause;
    throw new FakeDataPresetError(RPC_ERRORS[cause?.code] ?? "storage", cause);
  }
}

export function listFakeDataPresets() {
  return operation("list");
}

export async function createFakeDataPreset(name, draft) {
  const title = name.trim();
  if (!title) throw new FakeDataPresetError("name");
  return operation("create", { name: title, config: validatePresetConfig(draft) });
}

export async function updateFakeDataPreset(id, draft) {
  return operation("update", { id, config: validatePresetConfig(draft) });
}

export function deleteFakeDataPreset(id) {
  return operation("delete", { id });
}
