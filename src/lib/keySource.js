import { invoke } from "./host.js";
import { CRYPTO_KEY_TYPES } from "./cryptoCapabilities.js";

const FORMAT_LABELS = Object.freeze({
  hex: "Hex",
  pem: "PEM",
  "hex-keypair": "Hex key pair",
  "base64-keypair": "Base64 key pair",
  base32: "Base32",
});

export function normalizeVaultKey(key) {
  const profile = CRYPTO_KEY_TYPES[key.algorithm] || {};
  const capabilities = key.capabilities || profile.capabilities || [];
  const allowedPurposes = Object.hasOwn(key, "allowedPurposes") ? key.allowedPurposes : null;
  return {
    ...key,
    displayType: key.displayType || String(key.algorithm || key.kind || "—").toUpperCase(),
    bits: key.bits ?? profile.bits ?? null,
    format: key.format || FORMAT_LABELS[profile.format] || profile.format || "—",
    capabilities,
    allowedPurposes,
    effectivePurposes: key.effectivePurposes || allowedPurposes || capabilities,
    supportLevel: key.supportLevel || profile.supportLevel || "supported",
    legacyPurposeState: key.legacyPurposeState || (allowedPurposes === null ? "pending" : "confirmed"),
    hasPublic: key.hasPublic ?? key.kind === "asymmetric",
  };
}

export function matchKey(key, picker, requiredPurpose = "", allowedAlgorithms = []) {
  if (requiredPurpose) {
    const purposes = key.effectivePurposes || key.capabilities || [];
    if (!purposes.includes(requiredPurpose)) return false;
  }
  if (allowedAlgorithms.length && !allowedAlgorithms.includes(key.algorithm)) return false;
  if (!picker) return true;
  if (picker === "aes") return key.algorithm === "aes-128" || key.algorithm === "aes-192" || key.algorithm === "aes-256";
  if (picker === "hmac") {
    return ["hmac", "hmac-sha1", "hmac-sha256", "hmac-sha384", "hmac-sha512", "hmac-sm3"].includes(key.algorithm);
  }
  if (picker === "xor") return (key.effectivePurposes || key.capabilities || []).includes("debug-xor");
  return key.algorithm === picker || key.kind === picker;
}

export function compatibleKeys(keys, picker, requiredPurpose = "", allowedAlgorithms = []) {
  return keys.filter((key) => matchKey(key, picker, requiredPurpose, allowedAlgorithms));
}

export async function loadVaultKeys() {
  try {
    const status = await invoke("toolbox/keys/status");
    if (!status.unlocked) return { unlocked: false, keys: [] };
    const listed = await invoke("toolbox/keys/list");
    return { unlocked: true, keys: (listed.keys || []).map(normalizeVaultKey) };
  } catch {
    return { unlocked: false, keys: [] };
  }
}

export function keyCtx(source, keyId, material) {
  if (source === "vault") return keyId ? { keyId } : null;
  const text = String(material || "").trim();
  return text ? { keyMaterial: text } : null;
}

export function applyKey(params, ctx) {
  if (ctx?.keyId) params.keyId = ctx.keyId;
  else if (ctx?.keyMaterial) params.keyMaterial = ctx.keyMaterial;
  return params;
}
