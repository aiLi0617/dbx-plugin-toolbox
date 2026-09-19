import {
  decodeBase32,
  decodeBase58,
  decodeQuotedPrintable,
  encodeBase32,
  encodeBase58,
  encodePunycode,
  encodeQuotedPrintable,
  escapeUnicode,
  fromBase64,
  textToBytes,
  toBase64,
  unescapeUnicode,
  bytesToHex,
  hexToBytes,
  bytesToText,
} from "../codec.js";
import { invoke } from "../host.js";
import { applyKey } from "../keySource.js";

export const BASE_FIELDS = [
  { id: "text", zh: "明文", en: "Text" },
  { id: "base64", zh: "Base64", en: "Base64" },
  { id: "base64url", zh: "Base64 URL", en: "Base64 URL" },
  { id: "base32", zh: "Base32", en: "Base32" },
  { id: "base58", zh: "Base58", en: "Base58" },
  { id: "hex", zh: "Hex", en: "Hex" },
];

export function encodeBytes(id, bytes) {
  if (id === "text") return bytesToText(bytes);
  if (id === "hex") return bytesToHex(bytes);
  if (id === "base32") return encodeBase32(bytes);
  if (id === "base58") return encodeBase58(bytes);
  return toBase64(bytes, id === "base64url");
}

export function decodeBytes(id, text) {
  const raw = String(text ?? "");
  if (id === "text") return textToBytes(raw);
  if (!raw.trim()) return new Uint8Array();
  if (id === "hex") return hexToBytes(raw.replace(/0x/gi, "").replace(/\s+/g, ""));
  if (id === "base32") return decodeBase32(raw);
  if (id === "base58") return decodeBase58(raw);
  return fromBase64(raw, id === "base64url");
}

export function htmlEntities(text, decode) {
  if (decode) {
    return text
      .replace(/&#x([0-9a-f]+);?/gi, (match, hex) => safeCodePoint(match, parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (match, dec) => safeCodePoint(match, Number(dec)))
      .replace(/&nbsp;/gi, "\u00a0")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
  }
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeCodePoint(original, value) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return original;
  return String.fromCodePoint(value);
}

export function escapeHtml(text) {
  return htmlEntities(text, false);
}

export function unescapeHtml(text) {
  return htmlEntities(text, true);
}

export { escapeUnicode, unescapeUnicode };

export function encodeUrl(text) {
  return encodeURIComponent(text);
}

export function decodeUrl(text) {
  return decodeURIComponent(text);
}

export function parseQuery(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { href: "", hash: "", rows: [] };
  const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  if (raw.startsWith("?") || (!absolute && /^[^/?#=]+(?:=|&|$)/.test(raw))) {
    const hashAt = raw.indexOf("#");
    const query = hashAt < 0 ? raw : raw.slice(0, hashAt);
    return { href: "", hash: hashAt < 0 ? "" : raw.slice(hashAt), rows: [...new URLSearchParams(query.replace(/^\?/, "")).entries()] };
  }
  try {
    const url = new URL(raw, "https://dbx.invalid");
    return {
      href: absolute ? `${url.origin}${url.pathname}` : url.pathname,
      hash: url.hash,
      rows: [...url.searchParams.entries()],
    };
  } catch {
    return {
      href: "",
      hash: "",
      rows: [...new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw).entries()],
    };
  }
}

export function punycodePair(text) {
  const value = String(text ?? "").trim();
  if (!value) return { unicode: "", ace: "" };
  const ace = encodePunycode(value);
  const unicode = ace.split(".").map((label) => label.startsWith("xn--") ? decodePunycodeLabel(label.slice(4)) : label).join(".");
  if (encodePunycode(unicode) !== ace) throw new Error("Invalid Punycode domain");
  return { unicode, ace };
}

// RFC 3492 section 6.2. URL performs IDNA validation and ASCII normalization;
// this decoder restores each validated ACE label for the Unicode output.
function decodePunycodeLabel(input) {
  const delimiter = input.lastIndexOf("-");
  const points = delimiter < 0 ? [] : [...input.slice(0, delimiter)].map((ch) => ch.codePointAt(0));
  let cursor = delimiter < 0 ? 0 : delimiter + 1;
  let n = 128;
  let index = 0;
  let bias = 72;
  while (cursor < input.length) {
    const previous = index;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (cursor >= input.length) throw new Error("Invalid Punycode domain");
      const code = input.charCodeAt(cursor++);
      const digit = code >= 97 && code <= 122 ? code - 97 : code >= 48 && code <= 57 ? code - 22 : 36;
      if (digit >= 36 || !Number.isSafeInteger(index + digit * weight)) throw new Error("Invalid Punycode domain");
      index += digit * weight;
      const threshold = Math.min(26, Math.max(1, k - bias));
      if (digit < threshold) break;
      weight *= 36 - threshold;
      if (!Number.isSafeInteger(weight)) throw new Error("Invalid Punycode domain");
    }
    const count = points.length + 1;
    let delta = Math.floor((index - previous) / (previous === 0 ? 700 : 2));
    delta += Math.floor(delta / count);
    let k = 0;
    while (delta > 455) { delta = Math.floor(delta / 35); k += 36; }
    bias = k + Math.floor(36 * delta / (delta + 38));
    n += Math.floor(index / count);
    index %= count;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error("Invalid Punycode domain");
    points.splice(index++, 0, n);
  }
  return String.fromCodePoint(...points);
}

export function toDataUri(text, mime = "text/plain;charset=utf-8") {
  const type = String(mime || "text/plain;charset=utf-8").trim() || "text/plain;charset=utf-8";
  const bytes = textToBytes(text);
  if (bytes.length > MAX_DATA_URI_BYTES) throw new Error("Data URI payload exceeds 10 MB");
  return `data:${type};base64,${toBase64(bytes)}`;
}

export function parseDataUri(value) {
  const raw = String(value ?? "").trim();
  if (raw.length > MAX_DATA_URI_INPUT_CHARS) throw new Error("Data URI exceeds the 10 MB payload limit");
  const match = raw.match(/^data:([^,]*?),(.*)$/s);
  if (!match) throw new Error("Invalid Data URI");
  const metadata = match[1];
  const encoded = match[2];
  if (metadata.length > MAX_DATA_URI_METADATA_CHARS) throw new Error("Data URI metadata is too long");
  const tokens = metadata.split(";").filter(Boolean);
  const base64 = tokens.at(-1)?.toLowerCase() === "base64";
  if (base64) tokens.pop();
  const mime = tokens[0]?.includes("/") ? tokens.shift() : "text/plain";
  const parameters = tokens;
  const charset = parameters.find((item) => item.toLowerCase().startsWith("charset="))?.slice(8) || "US-ASCII";
  let bytes;
  if (base64) {
    if (encoded.length > MAX_DATA_URI_BASE64_CHARS) throw new Error("Data URI payload exceeds 10 MB");
    bytes = fromBase64(encoded, false);
  } else {
    bytes = decodeDataUriBytes(encoded);
  }
  if (bytes.length > MAX_DATA_URI_BYTES) throw new Error("Data URI payload exceeds 10 MB");
  const textual = mime.startsWith("text/") || /(?:json|xml|javascript|svg|yaml|toml|csv)/i.test(mime);
  return {
    mime,
    charset,
    parameters,
    base64,
    bytes,
    text: textual ? bytesToText(bytes) : "",
    size: bytes.length,
  };
}

const MAX_DATA_URI_BYTES = 10 * 1024 * 1024;
const MAX_DATA_URI_METADATA_CHARS = 4096;
const MAX_DATA_URI_BASE64_CHARS = Math.ceil(MAX_DATA_URI_BYTES / 3) * 4 + 4;
const MAX_DATA_URI_INPUT_CHARS = MAX_DATA_URI_BYTES * 3 + MAX_DATA_URI_METADATA_CHARS + 6;

function decodeDataUriBytes(encoded) {
  let out = new Uint8Array(Math.min(Math.max(encoded.length, 64), MAX_DATA_URI_BYTES));
  let size = 0;
  let plain = "";
  const ensureCapacity = (additional) => {
    const required = size + additional;
    if (required > MAX_DATA_URI_BYTES) throw new Error("Data URI payload exceeds 10 MB");
    if (required <= out.length) return;
    const next = new Uint8Array(Math.min(MAX_DATA_URI_BYTES, Math.max(required, out.length * 2)));
    next.set(out.subarray(0, size));
    out = next;
  };
  const append = (bytes) => {
    ensureCapacity(bytes.length);
    out.set(bytes, size);
    size += bytes.length;
  };
  const flush = () => {
    if (!plain) return;
    append(textToBytes(plain));
    plain = "";
  };
  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] !== "%") {
      plain += encoded[i];
      continue;
    }
    flush();
    const pair = encoded.slice(i + 1, i + 3);
    if (!/^[0-9a-f]{2}$/i.test(pair)) throw new Error("Invalid percent encoding in Data URI");
    ensureCapacity(1);
    out[size++] = parseInt(pair, 16);
    i += 2;
  }
  flush();
  return out.slice(0, size);
}

export function quotedPrintable(text, decode) {
  return decode ? decodeQuotedPrintable(text) : encodeQuotedPrintable(text);
}

export function decodeJwt(text) {
  const parts = String(text ?? "").trim().split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error("JWT must contain three non-empty parts");
  const decode = (p) => bytesToText(fromBase64(p, true));
  return {
    header: JSON.parse(decode(parts[0])),
    payload: JSON.parse(decode(parts[1])),
    signature: parts[2] || "",
  };
}

export const JWT_ALGORITHMS = ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];

export async function signJwt(payload, ctx, algorithm = "HS256") {
  JSON.parse(payload);
  const params = { action: "jwt-sign", text: payload, algorithm };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return result.text;
}

export async function verifyJwt(token, ctx, algorithm = "HS256") {
  decodeJwt(token);
  const params = { action: "jwt-verify", text: String(token ?? "").trim(), algorithm };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return Boolean(result.valid);
}

export function inspectJwtClaims(payload, nowMs = Date.now()) {
  const now = Math.floor(Number(nowMs) / 1000);
  const invalid = [];
  const dateClaim = (name) => {
    const value = payload?.[name];
    if (value === undefined) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(new Date(value * 1000).getTime())) {
      invalid.push(name);
      return null;
    }
    return value;
  };
  const exp = dateClaim("exp");
  const nbf = dateClaim("nbf");
  const iat = dateClaim("iat");
  return {
    expired: exp !== null ? now >= exp : null,
    active: nbf !== null ? now >= nbf : payload?.nbf === undefined ? true : null,
    issuedInFuture: iat !== null ? iat > now : null,
    exp: exp !== null ? new Date(exp * 1000).toISOString() : "",
    nbf: nbf !== null ? new Date(nbf * 1000).toISOString() : "",
    iat: iat !== null ? new Date(iat * 1000).toISOString() : "",
    invalid,
  };
}

export function symmetricParams(input, opts = {}, ctx) {
  const algorithm = opts.algorithm || "aes-256";
  const mode = algorithm === "sm4-128" ? (opts.sm4Mode || "cbc") : (opts.mode || "gcm");
  const params = { action: opts.op || "encrypt", algorithm, mode, text: input };
  if (opts.payloadFormat === "separate") {
    Object.assign(params, {
      payloadFormat: "separate", cipherEncoding: opts.cipherEncoding || "base64",
      parameterEncoding: opts.parameterEncoding || "hex", plainEncoding: opts.plainEncoding || "utf8",
    });
    if (mode !== "ecb") params.iv = opts.iv || "";
    if (mode === "gcm") Object.assign(params, { aad: opts.aad || "", aadEncoding: opts.aadEncoding || "utf8", tag: opts.op === "decrypt" ? opts.tag || "" : "" });
  }
  applyKey(params, ctx);
  return params;
}

export async function runSymmetric(input, opts, ctx) {
  return (await runSymmetricDetailed(input, opts, ctx)).text;
}

export async function runSymmetricDetailed(input, opts, ctx) {
  return invoke("toolbox/crypto", symmetricParams(input, opts, ctx));
}

export async function runHmac(input, algorithm, ctx) {
  const params = { action: "hmac", algorithm: algorithm || "hmac-sha256", text: input };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return result.digest;
}

export async function runXor(input, inputHex, ctx) {
  const params = { action: "xor", text: input, inputHex: Boolean(inputHex) };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return { hex: result.text || "", utf8: result.utf8 || "" };
}

export async function runAsymmetric(input, opts, ctx) {
  const algorithm = opts.algorithm || "rsa";
  const params = { action: algorithm, op: opts.op || "encrypt", text: input };
  if (algorithm === "rsa" && opts.padding) params.padding = opts.padding;
  if (opts.op === "decrypt" && opts.outputEncoding) params.outputEncoding = opts.outputEncoding;
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return result.text;
}

export async function inspectCert(pem) {
  return invoke("toolbox/cert", { pem });
}

export const HMAC_ALGORITHMS = [
  { value: "hmac-sha256", zh: "HMAC-SHA256", en: "HMAC-SHA256" },
  { value: "hmac-sm3", zh: "HMAC-SM3", en: "HMAC-SM3" },
];

export const RSA_PADDINGS = [
  { value: "oaep", zh: "OAEP-SHA256", en: "OAEP-SHA256" },
  { value: "pkcs1", zh: "PKCS#1 v1.5", en: "PKCS#1 v1.5" },
];
