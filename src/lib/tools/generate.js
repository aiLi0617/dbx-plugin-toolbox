import { invoke } from "../host.js";
import { crc32, crc32Bytes, encodeUlid, nanoId, randomPassword, shaDigest, toBase64 } from "../codec.js";

export const HASH_ALGORITHMS = [
  { id: "md5-16", label: "MD5 - 16", labelZh: "MD5 - 16 位", labelEn: "MD5 - 16 chars" },
  { id: "md5", label: "MD5 - 32", labelZh: "MD5 - 32 位", labelEn: "MD5 - 32 chars" },
  { id: "sha-1", label: "SHA1" },
  { id: "sha-224", label: "SHA224" },
  { id: "sha-256", label: "SHA256" },
  { id: "sha3-256", label: "SHA3" },
  { id: "sha-384", label: "SHA384" },
  { id: "sha-512", label: "SHA512" },
  { id: "sm3", label: "SM3" },
  { id: "crc32", label: "CRC32" },
];

const WEB_HASH = { "sha-1": "SHA-1", "sha-256": "SHA-256", "sha-384": "SHA-384", "sha-512": "SHA-512" };
const SIDECAR_HASH = new Set(["md5-16", "md5", "sha-224", "sha3-256", "sm3"]);

export async function hashText(algorithm, text) {
  if (algorithm === "crc32") return crc32(text);
  if (SIDECAR_HASH.has(algorithm)) {
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
  if (SIDECAR_HASH.has(algorithm)) {
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

/** Vault save after local WebCrypto gen is quick; keep a modest host timeout. */
export function rsaGenerateTimeoutMs(bits) {
  const n = Number(bits) || 2048;
  if (n >= 4096) return 30000;
  if (n >= 3072) return 20000;
  return 15000;
}

function requireSubtle() {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto is unavailable in this environment");
  return globalThis.crypto.subtle;
}

function pemFromDer(bytes, label) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = (
    typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64")
  )
    .match(/.{1,64}/g)
    ?.join("\n") || "";
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

function readAsn1Length(bytes, offset) {
  if (offset >= bytes.length) throw new Error("Truncated ASN.1 length");
  let length = bytes[offset++];
  if (length < 0x80) return { length, offset };
  const size = length & 0x7f;
  if (size === 0 || size > 4 || offset + size > bytes.length) {
    throw new Error("Invalid ASN.1 length");
  }
  length = 0;
  for (let i = 0; i < size; i++) length = (length << 8) | bytes[offset++];
  return { length, offset };
}

function expectAsn1(bytes, offset, tag) {
  if (offset >= bytes.length || bytes[offset] !== tag) throw new Error("Unexpected ASN.1 tag");
  return readAsn1Length(bytes, offset + 1);
}

/** Unwrap PKCS#8 PrivateKeyInfo → PKCS#1 RSAPrivateKey DER. */
export function unwrapPkcs8ToPkcs1(pkcs8) {
  const bytes = pkcs8 instanceof Uint8Array ? pkcs8 : new Uint8Array(pkcs8);
  let { offset } = expectAsn1(bytes, 0, 0x30);
  const version = expectAsn1(bytes, offset, 0x02);
  offset = version.offset + version.length;
  const algorithm = expectAsn1(bytes, offset, 0x30);
  offset = algorithm.offset + algorithm.length;
  const octet = expectAsn1(bytes, offset, 0x04);
  return bytes.slice(octet.offset, octet.offset + octet.length);
}

/** Unwrap SPKI → PKCS#1 RSAPublicKey DER. */
export function unwrapSpkiToPkcs1(spki) {
  const bytes = spki instanceof Uint8Array ? spki : new Uint8Array(spki);
  let { offset } = expectAsn1(bytes, 0, 0x30);
  const algorithm = expectAsn1(bytes, offset, 0x30);
  offset = algorithm.offset + algorithm.length;
  const bitString = expectAsn1(bytes, offset, 0x03);
  if (bitString.length < 1) throw new Error("Empty subjectPublicKey");
  // First byte is the unused-bits count (0 for RSA).
  return bytes.slice(bitString.offset + 1, bitString.offset + bitString.length);
}

/**
 * Generate an RSA key pair via WebCrypto (OS-backed, much faster than pure-Rust rsa).
 * @param {number|string} bits 2048 | 3072 | 4096
 * @param {"pkcs8"|"pkcs1"} format
 * @returns {Promise<{ publicKey: string, privateKey: string, bits: number, format: string }>}
 */
export async function generateRsaKeyPairPem(bits = 2048, format = "pkcs8") {
  const modulusLength = Number(bits) || 2048;
  if (![2048, 3072, 4096].includes(modulusLength)) {
    throw new Error("RSA bits must be 2048, 3072, or 4096");
  }
  const pemFormat = String(format || "pkcs8").toLowerCase() === "pkcs1" ? "pkcs1" : "pkcs8";
  const subtle = requireSubtle();
  const pair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const [pkcs8, spki] = await Promise.all([
    subtle.exportKey("pkcs8", pair.privateKey).then((buf) => new Uint8Array(buf)),
    subtle.exportKey("spki", pair.publicKey).then((buf) => new Uint8Array(buf)),
  ]);
  if (pemFormat === "pkcs1") {
    return {
      publicKey: pemFromDer(unwrapSpkiToPkcs1(spki), "RSA PUBLIC KEY"),
      privateKey: pemFromDer(unwrapPkcs8ToPkcs1(pkcs8), "RSA PRIVATE KEY"),
      bits: modulusLength,
      format: pemFormat,
    };
  }
  return {
    publicKey: pemFromDer(spki, "PUBLIC KEY"),
    privateKey: pemFromDer(pkcs8, "PRIVATE KEY"),
    bits: modulusLength,
    format: pemFormat,
  };
}

export const SYMMETRIC_KEY_ALGORITHMS = [
  { id: "aes-256", label: "AES-256", bytes: 32, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "aes-128", label: "AES-128", bytes: 16, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "sm4-128", label: "SM4", bytes: 16, groupZh: "对称加密 / XOR", groupEn: "Symmetric / XOR" },
  { id: "hmac-sha1", label: "SHA-1", bytes: 20, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
  { id: "hmac-sha256", label: "SHA-256", bytes: 32, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
  { id: "hmac-sha384", label: "SHA-384", bytes: 48, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
  { id: "hmac-sha512", label: "SHA-512", bytes: 64, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
  { id: "hmac-sm3", label: "SM3", bytes: 32, groupZh: "HMAC / JWT", groupEn: "HMAC / JWT" },
];

/**
 * Generate AES / SM4 / HMAC key material as lowercase hex via WebCrypto CSPRNG.
 * @param {string} algorithm one of SYMMETRIC_KEY_ALGORITHMS ids
 * @returns {{ algorithm: string, material: string, bytes: number }}
 */
export function generateSymmetricKeyMaterial(algorithm) {
  const meta = SYMMETRIC_KEY_ALGORITHMS.find((item) => item.id === algorithm);
  if (!meta) throw new Error("Unsupported symmetric key algorithm");
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("WebCrypto CSPRNG is unavailable in this environment");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(meta.bytes));
  const material = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { algorithm: meta.id, material, bytes: meta.bytes };
}
