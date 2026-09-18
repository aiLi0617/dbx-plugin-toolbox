import { invoke } from "./host.js";

export function matchKey(key, picker) {
  if (!picker) return true;
  if (picker === "aes") return key.algorithm === "aes-128" || key.algorithm === "aes-256";
  if (picker === "hmac") return key.algorithm === "hmac" || key.algorithm === "hmac-sha256";
  if (picker === "xor") {
    return key.algorithm !== "rsa-pem" && key.algorithm !== "sm2";
  }
  return key.algorithm === picker || key.kind === picker;
}

export async function loadVaultKeys() {
  try {
    const status = await invoke("toolbox/keys/status");
    if (!status.unlocked) return { unlocked: false, keys: [] };
    const listed = await invoke("toolbox/keys/list");
    return { unlocked: true, keys: listed.keys || [] };
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
