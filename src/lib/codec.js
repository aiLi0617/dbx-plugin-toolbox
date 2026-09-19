function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2) throw new Error("Odd hex length");
  if (!/^[0-9a-f]*$/i.test(clean)) throw new Error("Invalid hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function textToBytes(text) {
  return new TextEncoder().encode(text);
}

export function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

export function toBase64(bytes, urlSafe = false) {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  const b64 = btoa(bin);
  return urlSafe ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : b64;
}

export function fromBase64(text, urlSafe = false) {
  let b64 = text.trim();
  if (urlSafe) {
    b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export { bytesToHex, hexToBytes };

export async function shaDigest(algorithm, text) {
  const buf = await crypto.subtle.digest(algorithm, textToBytes(text));
  return bytesToHex(new Uint8Array(buf));
}

export function unescapeUnicode(input) {
  return input.replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(
    /\\u([0-9a-fA-F]{4})/g,
    (_, h) => String.fromCharCode(parseInt(h, 16)),
  );
}

export function escapeUnicode(input) {
  return [...input].map((ch) => {
    const cp = ch.codePointAt(0);
    return cp > 0x7f ? "\\u{" + cp.toString(16) + "}" : ch;
  }).join("");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes) {
  let bits = "";
  bytes.forEach((b) => {
    bits += b.toString(2).padStart(8, "0");
  });
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += B32[parseInt(chunk, 2)];
  }
  while (out.length % 8) out += "=";
  return out;
}

export function decodeBase32(text) {
  const clean = text.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid Base32");
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(bytes);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function encodeBase58(bytes) {
  if (!bytes.length) return "";
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let body = "";
  while (value > 0n) {
    body = B58[Number(value % 58n)] + body;
    value /= 58n;
  }
  return "1".repeat(zeros) + body;
}

export function decodeBase58(text) {
  const clean = text.trim();
  if (!clean) return new Uint8Array();
  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === "1") zeros++;
  let value = 0n;
  for (const ch of clean) {
    const digit = B58.indexOf(ch);
    if (digit < 0) throw new Error("Invalid Base58");
    value = value * 58n + BigInt(digit);
  }
  const body = [];
  while (value > 0n) {
    body.push(Number(value & 0xffn));
    value >>= 8n;
  }
  body.reverse();
  return new Uint8Array([...Array(zeros).fill(0), ...body]);
}

export function encodeQuotedPrintable(text) {
  const logicalLines = String(text ?? "").split(/\r\n|\r|\n/);
  return logicalLines.map((line) => {
    const bytes = textToBytes(line);
    let trailingStart = bytes.length;
    while (trailingStart > 0 && (bytes[trailingStart - 1] === 9 || bytes[trailingStart - 1] === 32)) trailingStart--;
    const tokens = [...bytes].map((b, i) => {
      const trailingSpace = (b === 9 || b === 32) && i >= trailingStart;
      return !trailingSpace && ((b >= 33 && b <= 60) || (b >= 62 && b <= 126) || b === 9 || b === 32)
        ? String.fromCharCode(b)
        : `=${b.toString(16).toUpperCase().padStart(2, "0")}`;
    });
    let out = "";
    let width = 0;
    for (const token of tokens) {
      if (width + token.length > 75) {
        out += "=\r\n";
        width = 0;
      }
      out += token;
      width += token.length;
    }
    return out;
  }).join("\r\n");
}

export function decodeQuotedPrintable(text) {
  const merged = text.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < merged.length; i++) {
    if (merged[i] === "=") {
      const pair = merged.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/i.test(pair)) throw new Error("Invalid quoted-printable escape");
      bytes.push(parseInt(pair, 16));
      i += 2;
    } else {
      const cp = merged.codePointAt(i);
      const encoded = textToBytes(String.fromCodePoint(cp));
      bytes.push(...encoded);
      if (cp > 0xffff) i++;
    }
  }
  return bytesToText(new Uint8Array(bytes));
}

export function encodePunycode(input) {
  const value = String(input ?? "").trim();
  if (!value || /[\s/@?#]/.test(value)) throw new Error("Invalid domain name");
  const url = new URL(`http://${value}`);
  if (url.username || url.password || url.port || url.pathname !== "/") throw new Error("Invalid domain name");
  return url.hostname;
}

export function randomPassword(length, sets) {
  const groups = [
    sets.lower !== false ? "abcdefghijklmnopqrstuvwxyz" : "",
    sets.upper !== false ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
    sets.digits !== false ? "0123456789" : "",
    sets.symbols ? "!@#$%^&*()-_=+[]{};:,.?" : "",
  ].filter(Boolean);
  if (!groups.length) throw new Error("Select at least one character set");
  const size = Math.trunc(Number(length));
  if (!Number.isInteger(size) || size < groups.length) throw new Error("Password length is too short");
  const alphabet = groups.join("");
  const randomIndex = (max) => {
    const limit = 256 - (256 % max);
    const byte = new Uint8Array(1);
    do crypto.getRandomValues(byte); while (byte[0] >= limit);
    return byte[0] % max;
  };
  const chars = groups.map((group) => group[randomIndex(group.length)]);
  while (chars.length < size) chars.push(alphabet[randomIndex(alphabet.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function encodeUlid() {
  const time = BigInt(Date.now());
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const encodePart = (value, width) => {
    let out = "";
    for (let i = 0; i < width; i++) {
      out = alphabet[Number(value & 31n)] + out;
      value >>= 5n;
    }
    return out;
  };
  const random = crypto.getRandomValues(new Uint8Array(10));
  let randomValue = 0n;
  for (const byte of random) randomValue = (randomValue << 8n) | BigInt(byte);
  return encodePart(time, 10) + encodePart(randomValue, 16);
}

export function nanoId(size = 21) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export function parseTotpConfig(input, defaults = {}) {
  const raw = String(input ?? "").trim();
  const config = {
    secret: raw,
    digits: Number(defaults.digits) || 6,
    step: Number(defaults.step) || 30,
    algorithm: String(defaults.algorithm || "SHA-1").toUpperCase(),
  };
  if (/^otpauth:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (url.protocol !== "otpauth:" || url.hostname.toLowerCase() !== "totp") throw new Error("Not a TOTP URI");
    config.secret = url.searchParams.get("secret") || "";
    if (url.searchParams.has("digits")) config.digits = Number(url.searchParams.get("digits"));
    if (url.searchParams.has("period")) config.step = Number(url.searchParams.get("period"));
    if (url.searchParams.has("algorithm")) config.algorithm = url.searchParams.get("algorithm").toUpperCase().replace(/^SHA(\d)/, "SHA-$1");
  }
  if (!config.secret) throw new Error("TOTP secret is required");
  if (![6, 8].includes(config.digits)) throw new Error("TOTP digits must be 6 or 8");
  if (!Number.isInteger(config.step) || config.step < 1 || config.step > 300) throw new Error("Invalid TOTP period");
  if (!["SHA-1", "SHA-256", "SHA-512"].includes(config.algorithm)) throw new Error("Unsupported TOTP algorithm");
  return config;
}

export async function totp(secret, digits = 6, step = 30, algorithm = "SHA-1", now = Date.now()) {
  const config = parseTotpConfig(secret, { digits, step, algorithm });
  const key = decodeBase32(config.secret.replace(/[\s-]+/g, ""));
  if (!key.length) throw new Error("TOTP secret is required");
  const counter = BigInt(Math.floor(now / 1000 / config.step));
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Number((counter >> 32n) & 0xffffffffn));
  view.setUint32(4, Number(counter & 0xffffffffn));
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: config.algorithm }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
  return String(bin % 10 ** config.digits).padStart(config.digits, "0");
}

export function crc32Bytes(bytes) {
  let crc = ~0 >>> 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ((~crc) >>> 0).toString(16).padStart(8, "0");
}

export function crc32(text) {
  return crc32Bytes(textToBytes(text));
}

