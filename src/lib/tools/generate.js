import { invoke } from "../host.js";
import { crc32, crc32Bytes, encodeUlid, nanoId, randomPassword, shaDigest, toBase64 } from "../codec.js";

export const HASH_ALGORITHMS = [
  { id: "md5", label: "MD5" },
  { id: "sha-1", label: "SHA-1" },
  { id: "sha-256", label: "SHA-256" },
  { id: "sha-512", label: "SHA-512" },
  { id: "sm3", label: "SM3" },
  { id: "crc32", label: "CRC32" },
];

const WEB_HASH = { "sha-1": "SHA-1", "sha-256": "SHA-256", "sha-512": "SHA-512" };

export async function hashText(algorithm, text) {
  if (algorithm === "crc32") return crc32(text);
  if (algorithm === "md5" || algorithm === "sm3") {
    const result = await invoke("toolbox/hash", { algorithm, text });
    return result.digest;
  }
  const web = WEB_HASH[algorithm];
  if (!web) throw new Error("unsupported hash");
  return shaDigest(web, text);
}

export async function hashBytes(algorithm, bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (algorithm === "crc32") return crc32Bytes(data);
  const web = WEB_HASH[algorithm];
  if (web) {
    const result = await crypto.subtle.digest(web, data);
    return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  if (algorithm === "md5" || algorithm === "sm3") {
    const result = await invoke("toolbox/hash", { algorithm, dataBase64: toBase64(data) }, 120000);
    return result.digest;
  }
  throw new Error("unsupported hash");
}

export function formatUuid(id, options = {}) {
  const hyphens = options.hyphens !== false;
  const hex = String(id ?? "").replace(/[{}]/g, "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return String(id ?? "");
  let body = hyphens
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    : hex;
  if (options.uppercase) body = body.toUpperCase();
  return options.braces ? `{${body}}` : body;
}

export function clampUniqueIdCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(100, Math.max(1, Math.round(n)));
}

export function generateUniqueId(kind, size = 21) {
  if (kind === "ulid") return encodeUlid();
  if (kind === "nanoid") return nanoId(Number(size) || 21);
  return crypto.randomUUID();
}

export function generateSecret(kind, length, symbols) {
  if (kind === "bytes") {
    const n = Math.min(1024, Math.max(1, Number(length) || 32));
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return randomPassword(Number(length) || 16, { symbols: symbols === "yes" });
}

export const RSA_BIT_OPTIONS = ["2048", "3072", "4096"];
export const RSA_PEM_FORMATS = [
  { value: "pkcs8", zh: "PKCS#8 PEM", en: "PKCS#8 PEM" },
  { value: "pkcs1", zh: "PKCS#1 PEM", en: "PKCS#1 PEM" },
];

export function rsaGenerateTimeoutMs(bits) {
  const n = Number(bits) || 2048;
  if (n >= 4096) return 120000;
  if (n >= 3072) return 90000;
  return 60000;
}

export const SYMMETRIC_KEY_ALGORITHMS = [
  { id: "aes-256", label: "AES-256", bytes: 32, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "aes-128", label: "AES-128", bytes: 16, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "sm4-128", label: "SM4", bytes: 16, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "hmac-sha256", label: "HMAC-SHA256", bytes: 32, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
  { id: "hmac-sm3", label: "HMAC-SM3", bytes: 32, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
];
