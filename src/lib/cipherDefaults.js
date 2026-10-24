import { asymmetricCipherProfile, symmetricCipherProfile } from "./cipherProfile.js";

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
  try {
    return sanitizeCipherDefaults(JSON.parse(localStorage.getItem(storageKey(kind, toolId)) || "{}"));
  } catch {
    return {};
  }
}

export function saveCipherDefaults(kind, toolId, options) {
  localStorage.setItem(storageKey(kind, toolId), JSON.stringify(sanitizeCipherDefaults(options)));
}

export function clearCipherDefaults(kind, toolId) {
  localStorage.removeItem(storageKey(kind, toolId));
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
