function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2) throw new Error("Odd hex length");
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
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}

export function decodeBase58(text) {
  const clean = text.trim();
  let zeros = 0;
  while (zeros < clean.length && clean[zeros] === "1") zeros++;
  const bytes = [0];
  for (let i = zeros; i < clean.length; i++) {
    let carry = B58.indexOf(clean[i]);
    if (carry < 0) throw new Error("Invalid Base58");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  return new Uint8Array([...Array(zeros).fill(0), ...bytes.reverse()]);
}

export function encodeQuotedPrintable(text) {
  const bytes = textToBytes(text);
  let out = "";
  let line = 0;
  for (const b of bytes) {
    let chunk;
    if ((b >= 33 && b <= 126 && b !== 61) || b === 9 || b === 32) chunk = String.fromCharCode(b);
    else chunk = "=" + b.toString(16).toUpperCase().padStart(2, "0");
    if (line + chunk.length > 75) {
      out += "=\r\n";
      line = 0;
    }
    out += chunk;
    line += chunk.length;
  }
  return out;
}

export function decodeQuotedPrintable(text) {
  const merged = text.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < merged.length; i++) {
    if (merged[i] === "=") {
      bytes.push(parseInt(merged.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(merged.charCodeAt(i));
  }
  return bytesToText(new Uint8Array(bytes));
}

export function encodePunycode(input) {
  try {
    return new URL("http://" + input).hostname;
  } catch {
    return punycodeEncode(input);
  }
}

function punycodeEncode(input) {
  const chars = [...input];
  const basic = chars.filter((c) => c.codePointAt(0) < 128).join("");
  const rest = chars.filter((c) => c.codePointAt(0) >= 128);
  if (!rest.length) return input;
  return "xn--" + basic + (basic ? "-" : "") + rest.map((c) => c.codePointAt(0).toString(36)).join("");
}

export function randomPassword(length, sets) {
  const alphabet = [
    sets.lower !== false ? "abcdefghijklmnopqrstuvwxyz" : "",
    sets.upper !== false ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "",
    sets.digits !== false ? "0123456789" : "",
    sets.symbols ? "!@#$%^&*()-_=+[]{};:,.?" : "",
  ].join("");
  if (!alphabet) throw new Error("Select at least one character set");
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export function encodeUlid() {
  const time = BigInt(Date.now());
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(16);
  const rand = crypto.getRandomValues(new Uint8Array(10));
  let ts = time;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(ts & 0xffn);
    ts >>= 8n;
  }
  bytes.set(rand, 6);
  let bits = "";
  bytes.forEach((b) => {
    bits += b.toString(2).padStart(8, "0");
  });
  bits = bits.slice(0, 130);
  let out = "";
  for (let i = 0; i < 26; i++) out += alphabet[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
  return out;
}

export function nanoId(size = 21) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function totp(secret, digits = 6, step = 30) {
  const key = decodeBase32(secret.replace(/\s+/g, ""));
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(4, counter);
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0xf;
  const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function crc32(text) {
  let crc = ~0 >>> 0;
  const bytes = textToBytes(text);
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ((~crc) >>> 0).toString(16).padStart(8, "0");
}

