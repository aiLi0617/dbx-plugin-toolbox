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
  try {
    const url = new URL(raw);
    return {
      href: `${url.origin}${url.pathname}`,
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
  return { unicode: value, ace: encodePunycode(value) };
}

export function toDataUri(text, mime = "text/plain;charset=utf-8") {
  const type = String(mime || "text/plain;charset=utf-8").trim() || "text/plain;charset=utf-8";
  return `data:${type};base64,${toBase64(textToBytes(text))}`;
}

export function quotedPrintable(text, decode) {
  return decode ? decodeQuotedPrintable(text) : encodeQuotedPrintable(text);
}

export function decodeJwt(text) {
  const parts = String(text ?? "").trim().split(".");
  if (parts.length < 2) throw new Error("Not a JWT");
  const decode = (p) => bytesToText(fromBase64(p, true));
  return {
    header: JSON.parse(decode(parts[0])),
    payload: JSON.parse(decode(parts[1])),
    signature: parts[2] || "",
  };
}

export async function signJwt(payload, ctx) {
  const params = { action: "jwt-sign", text: payload, algorithm: "hmac-sha256" };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return result.text;
}

export async function runSymmetric(input, opts, ctx) {
  const algorithm = opts.algorithm || "aes-256";
  const mode = algorithm === "sm4-128" ? (opts.sm4Mode || "cbc") : (opts.mode || "gcm");
  const params = { action: opts.op || "encrypt", algorithm, mode, text: input };
  applyKey(params, ctx);
  const result = await invoke("toolbox/crypto", params);
  return result.text;
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

export const encodeTools = [
  {
    id: "base64",
    category: "encode",
    phase: "p0",
    name: { zh: "Base / Hex 编码", en: "Base / Hex" },
    aliases: ["base32", "base58", "hex"],
    view: "base64",
  },
  {
    id: "url",
    category: "encode",
    phase: "p0",
    name: { zh: "URL", en: "URL" },
    view: "url",
  },
  {
    id: "html-entities",
    category: "encode",
    phase: "p0",
    name: { zh: "文本转义", en: "Text escape" },
    aliases: ["unicode", "html-entities"],
    view: "html-entities",
  },
  {
    id: "punycode",
    category: "encode",
    phase: "p1",
    name: { zh: "Punycode", en: "Punycode" },
    view: "punycode",
  },
  {
    id: "data-uri",
    category: "encode",
    phase: "p1",
    name: { zh: "Data URI", en: "Data URI" },
    view: "data-uri",
  },
  {
    id: "quoted-printable",
    category: "encode",
    phase: "p1",
    name: { zh: "Quoted-printable", en: "Quoted-printable" },
    view: "live-io",
  },
  {
    id: "jwt",
    category: "encode",
    phase: "p0",
    name: { zh: "JWT", en: "JWT" },
    view: "jwt",
  },
  {
    id: "aes",
    category: "encode",
    phase: "p0",
    name: { zh: "对称加密", en: "Symmetric cipher" },
    aliases: ["sm4"],
    view: "aes",
  },
  {
    id: "hmac-sha256",
    category: "encode",
    phase: "p0",
    name: { zh: "HMAC", en: "HMAC" },
    aliases: ["hmac-sm3", "hmac"],
    view: "hmac",
  },
  {
    id: "xor",
    category: "encode",
    phase: "p1",
    name: { zh: "XOR（仅调试）", en: "XOR (debug only)" },
    view: "xor",
  },
  {
    id: "rsa",
    category: "encode",
    phase: "p1",
    name: { zh: "非对称加密", en: "Asymmetric cipher" },
    aliases: ["sm2", "rsa"],
    view: "rsa",
  },
  {
    id: "cert",
    category: "encode",
    phase: "p0",
    name: { zh: "证书 / SSH 指纹", en: "Cert / SSH fingerprint" },
    aliases: ["ssh-fingerprint"],
    view: "cert",
  },
];
