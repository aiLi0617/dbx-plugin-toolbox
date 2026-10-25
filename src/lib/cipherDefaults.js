import { asymmetricCipherProfile, symmetricCipherProfile } from "./cipherProfile.js";
import { invoke } from "./host.js";

const choices = {
  op: ["encrypt", "decrypt"],
  algorithm: ["aes-128", "aes-192", "aes-256"],
  mode: ["gcm", "cbc", "ctr", "ecb"],
  sm4Mode: ["cbc", "ecb"],
  padding: ["oaep", "pkcs1"],
  oaepHash: ["sha1", "sha256", "sha384", "sha512"],
  outputEncoding: ["utf8", "hex", "base64"],
  inputHex: ["text", "hex"],
  source: ["once", "vault"],
  keyEncoding: ["auto", "utf8", "hex", "base64"],
  payloadFormat: ["packed", "separate"],
  cipherEncoding: ["hex", "base64"],
  parameterEncoding: ["hex", "base64"],
  plainEncoding: ["utf8", "hex", "base64"],
  aadEncoding: ["utf8", "hex", "base64"],
};

// Some embedded hosts expose localStorage but reject writes from a sandboxed
// frame. Keep a session-scoped fallback so the control remains usable there.
const memoryDefaults = new Map();

// Only enum settings may be persisted. Keys, messages, IVs, tags and AAD never enter storage.
export function sanitizeCipherDefaults(value) {
  return Object.fromEntries(Object.entries(choices)
    .filter(([name, allowed]) => allowed.includes(value?.[name]))
    .map(([name]) => [name, value[name]]));
}

function storageKey(kind, toolId) {
  return `toolbox.cipherDefaults.${kind}.${toolId || kind}`;
}

export function readCipherDefaults(kind, toolId) {
  const key = storageKey(kind, toolId);
  if (memoryDefaults.has(key)) return memoryDefaults.get(key);
  try {
    return sanitizeCipherDefaults(JSON.parse(globalThis.localStorage?.getItem(key) || "{}"));
  } catch {
    return {};
  }
}

export function saveCipherDefaults(kind, toolId, options, allowSessionFallback = false) {
  const key = storageKey(kind, toolId);
  const clean = sanitizeCipherDefaults(options);
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(clean));
    memoryDefaults.set(key, clean);
    return true;
  } catch (error) {
    if (!allowSessionFallback) throw error;
    memoryDefaults.set(key, clean);
    return false;
  }
}

export function clearCipherDefaults(kind, toolId, allowSessionFallback = false) {
  const key = storageKey(kind, toolId);
  memoryDefaults.delete(key);
  try { globalThis.localStorage?.removeItem(key); }
  catch (error) { if (!allowSessionFallback) throw error; }
}

export async function loadCipherDefaults(kind, toolId) {
  try {
    const result = await invoke("toolbox/cipher-defaults/get", { kind, toolId });
    return sanitizeCipherDefaults(result?.options || {});
  } catch {
    return readCipherDefaults(kind, toolId);
  }
}

export async function persistCipherDefaults(kind, toolId, options) {
  const clean = sanitizeCipherDefaults(options);
  try {
    await invoke("toolbox/cipher-defaults/set", { kind, toolId, options: clean });
    return true;
  } catch {
    return saveCipherDefaults(kind, toolId, clean, true);
  }
}

export async function clearPersistedCipherDefaults(kind, toolId) {
  try {
    await invoke("toolbox/cipher-defaults/clear", { kind, toolId });
    clearCipherDefaults(kind, toolId, true);
    return true;
  } catch {
    clearCipherDefaults(kind, toolId, true);
    return false;
  }
}

export function resolveCipherDefaults(kind, toolId, saved = {}, initial = {}) {
  const options = { ...sanitizeCipherDefaults(saved), ...sanitizeCipherDefaults(initial) };
  // The SM4 selector uses sm4Mode in requests, while launch presets use mode.
  const sm4Mode = initial?.mode ?? initial?.sm4Mode ?? options.sm4Mode ?? options.mode;
  const profile = kind === "aes"
    ? symmetricCipherProfile(toolId, toolId === "sm4" ? { ...options, mode: sm4Mode } : options)
    : { algorithm: kind === "rsa" ? asymmetricCipherProfile(toolId) : "aes-256", mode: "gcm", sm4Mode: "cbc" };
  return {
    op: "encrypt", padding: "oaep", oaepHash: "sha256", outputEncoding: "utf8",
    inputHex: "text", source: "once", keyEncoding: "auto", payloadFormat: "packed",
    cipherEncoding: "base64", parameterEncoding: "hex", plainEncoding: "utf8", aadEncoding: "utf8",
    ...options, ...profile,
    ...(toolId === "rsa-oaep" ? { padding: "oaep" } : toolId === "rsa-pkcs1" ? { padding: "pkcs1" } : {}),
  };
}
