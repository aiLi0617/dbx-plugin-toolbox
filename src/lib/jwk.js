// Small, local JWK/JWKS interop helpers.  The converter deliberately validates
// the JSON shape before handing a key to WebCrypto so malformed key material
// cannot be silently normalized into a different key.

export const MAX_JWK_DOCUMENT_BYTES = 1_000_000;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const RSA_FIELDS = ["n", "e", "d", "p", "q", "dp", "dq", "qi", "oth"];

function bad(message, code = "jwk") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function byteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).length;
}

export function decodeBase64Url(value, label = "JWK member") {
  const raw = String(value ?? "");
  if (!raw || !BASE64URL.test(raw))
    throw bad(`${label} must be unpadded base64url`);
  const padded =
    raw.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (raw.length % 4)) % 4);
  try {
    if (typeof atob === "function") {
      const decoded = atob(padded);
      return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    }
    return Uint8Array.from(Buffer.from(padded, "base64"));
  } catch {
    throw bad(`${label} is not valid base64url`);
  }
}

export function encodeBase64Url(bytes) {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of values) binary += String.fromCharCode(byte);
  const encoded =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(values).toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validateCommon(key, index) {
  if (!key || typeof key !== "object" || Array.isArray(key))
    throw bad(`JWK ${index + 1} must be an object`);
  if (typeof key.kty !== "string" || !key.kty.trim())
    throw bad(`JWK ${index + 1} is missing kty`);
  for (const name of ["kid", "alg", "use", "key_ops", "crv"]) {
    if (
      key[name] !== undefined &&
      typeof key[name] !== "string" &&
      !Array.isArray(key[name])
    ) {
      throw bad(`JWK ${index + 1} has an invalid ${name}`);
    }
  }
  if (key.kid !== undefined && (!key.kid || byteLength(key.kid) > 256))
    throw bad(`JWK ${index + 1} has an invalid kid`);
  if (
    key.key_ops !== undefined &&
    (!Array.isArray(key.key_ops) ||
      key.key_ops.some((item) => typeof item !== "string"))
  ) {
    throw bad(`JWK ${index + 1} has invalid key_ops`);
  }
}

export function validateJwk(input, index = 0) {
  const key = { ...input };
  validateCommon(key, index);
  const required = {
    RSA: ["n", "e"],
    EC: ["crv", "x", "y"],
    OKP: ["crv", "x"],
    oct: ["k"],
  }[key.kty];
  if (!required) throw bad(`Unsupported JWK kty: ${key.kty}`);
  for (const field of required)
    decodeBase64Url(key[field], `JWK ${index + 1} ${field}`);
  for (const field of RSA_FIELDS) {
    if (key[field] !== undefined && field !== "oth")
      decodeBase64Url(key[field], `JWK ${index + 1} ${field}`);
  }
  if (key.oth !== undefined && !Array.isArray(key.oth))
    throw bad(`JWK ${index + 1} oth must be an array`);
  return key;
}

export function parseJwkDocument(input) {
  const raw = typeof input === "string" ? input : JSON.stringify(input);
  if (byteLength(raw) > MAX_JWK_DOCUMENT_BYTES)
    throw bad("JWK/JWKS input exceeds 1 MB");
  let value;
  try {
    value = typeof input === "string" ? JSON.parse(input) : input;
  } catch {
    throw bad("Invalid JWK JSON", "json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw bad("JWK must be an object");
  if (Array.isArray(value.keys)) {
    if (value.keys.length > 100) throw bad("JWKS contains too many keys");
    const keys = value.keys.map((key, index) => validateJwk(key, index));
    const kids = new Set();
    for (const key of keys) {
      if (key.kid && kids.has(key.kid))
        throw bad(`JWKS contains duplicate kid: ${key.kid}`);
      if (key.kid) kids.add(key.kid);
    }
    return { type: "jwks", keys };
  }
  return { type: "jwk", keys: [validateJwk(value, 0)] };
}

export function selectJwk(document, kid = "") {
  const keys = document?.keys || [];
  if (!keys.length) throw bad("JWK set is empty");
  if (!kid) return keys[0];
  const key = keys.find((item) => item.kid === kid);
  if (!key && /^\d+$/.test(kid)) {
    const index = Number(kid);
    if (Number.isSafeInteger(index) && keys[index]) return keys[index];
  }
  if (!key) throw bad(`JWK kid not found: ${kid}`);
  return key;
}

export function serializeJwkDocument(document, pretty = true) {
  if (document?.type === "jwks")
    return JSON.stringify({ keys: document.keys }, null, pretty ? 2 : 0);
  return JSON.stringify(document?.keys?.[0] || {}, null, pretty ? 2 : 0);
}

function rsaAlgorithm(key) {
  const alg = String(key.alg || "RS256").toUpperCase();
  const hash = alg.endsWith("384")
    ? "SHA-384"
    : alg.endsWith("512")
      ? "SHA-512"
      : "SHA-256";
  if (alg.startsWith("PS")) return { name: "RSA-PSS", hash };
  if (alg.startsWith("RSA-OAEP")) return { name: "RSA-OAEP", hash };
  return { name: "RSASSA-PKCS1-v1_5", hash };
}

function pemFromBytes(bytes, label) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    (typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64")
    )
      .match(/.{1,64}/g)
      ?.join("\n") || "";
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}

function requireSubtle() {
  if (!globalThis.crypto?.subtle)
    throw bad("WebCrypto is unavailable in this environment", "crypto");
  return globalThis.crypto.subtle;
}

export async function jwkToPem(key) {
  const jwk = validateJwk(key, 0);
  if (jwk.kty !== "RSA")
    throw bad("PEM conversion currently supports RSA JWK only");
  const subtle = requireSubtle();
  const algorithm = rsaAlgorithm(jwk);
  const privateKey = Boolean(jwk.d);
  const usages = privateKey
    ? algorithm.name === "RSA-OAEP"
      ? ["decrypt"]
      : ["sign"]
    : algorithm.name === "RSA-OAEP"
      ? ["encrypt"]
      : ["verify"];
  const cryptoKey = await subtle.importKey(
    "jwk",
    { ...jwk, ext: true },
    algorithm,
    true,
    usages,
  );
  const format = privateKey ? "pkcs8" : "spki";
  const exported = await subtle.exportKey(format, cryptoKey);
  return pemFromBytes(
    new Uint8Array(exported),
    privateKey ? "PRIVATE KEY" : "PUBLIC KEY",
  );
}

export async function pemToJwk(pem) {
  const text = String(pem ?? "").trim();
  const match = text.match(
    /^-----BEGIN ([A-Z0-9 #]+)-----([\s\S]+?)-----END \1-----$/,
  );
  if (!match)
    throw bad("PEM must contain a standard public or private key block");
  const label = match[1];
  if (!/^(PUBLIC KEY|PRIVATE KEY)$/.test(label))
    throw bad("PEM conversion accepts PKCS#8/SPKI RSA keys");
  const body = match[2].replace(/\s+/g, "");
  let bytes;
  try {
    const binary = atob(body);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw bad("PEM body is not valid base64");
  }
  const subtle = requireSubtle();
  const privateKey = label === "PRIVATE KEY";
  const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  const usages = privateKey ? ["sign"] : ["verify"];
  const cryptoKey = await subtle.importKey(
    privateKey ? "pkcs8" : "spki",
    bytes,
    algorithm,
    true,
    usages,
  );
  return await subtle.exportKey("jwk", cryptoKey);
}
