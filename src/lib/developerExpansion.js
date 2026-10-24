import { parseAllDocuments } from "yaml";

export function boundedText(value, max = 1_000_000) {
  const text = String(value ?? "");
  if (new TextEncoder().encode(text).length > max)
    throw new Error("Input is too large");
  return text;
}

export function basicAuth(username, password) {
  if (username.includes(":") || /[\r\n\0]/.test(username + password))
    throw new Error("Invalid credentials");
  const bytes = new TextEncoder().encode(
    boundedText(`${username}:${password}`, 32_768),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Authorization: Basic ${btoa(binary)}`;
}

export function jsonStructureDiff(left, right) {
  const a = JSON.parse(boundedText(left)),
    b = JSON.parse(boundedText(right));
  const changes = [];
  function walk(x, y, path, depth) {
    if (depth > 100) throw new Error("Maximum nesting depth exceeded");
    if (Object.is(x, y)) return;
    if (
      x &&
      y &&
      typeof x === "object" &&
      typeof y === "object" &&
      Array.isArray(x) === Array.isArray(y)
    ) {
      for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
        const next = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
        if (!Object.hasOwn(x, key))
          changes.push({ path: next, type: "added", after: y[key] });
        else if (!Object.hasOwn(y, key))
          changes.push({ path: next, type: "removed", before: x[key] });
        else walk(x[key], y[key], next, depth + 1);
      }
    } else
      changes.push({
        path: path || "/",
        type: "modified",
        before: x,
        after: y,
      });
    if (changes.length > 20_000) throw new Error("Too many differences");
  }
  walk(a, b, "", 0);
  return changes;
}

export function yamlDocuments(source) {
  return parseAllDocuments(boundedText(source)).map((doc) => {
    if (doc.errors.length) {
      const error = new Error(doc.errors.map((e) => e.message).join("\n"));
      const position = doc.errors[0].linePos?.[0];
      if (position) Object.assign(error, { line: position.line, column: position.col });
      throw error;
    }
    return doc.toJS({ maxAliasCount: 100 });
  });
}
export function treeRows(value, path = "$", depth = 0) {
  if (depth > 100) throw new Error("Maximum nesting depth exceeded");
  return {
    path,
    value:
      value && typeof value === "object"
        ? Array.isArray(value)
          ? `Array (${value.length})`
          : "Object"
        : String(value),
    children:
      value && typeof value === "object"
        ? Object.entries(value).map(([k, v]) =>
            treeRows(v, `${path}[${JSON.stringify(k)}]`, depth + 1),
          )
        : [],
  };
}
export function decodeSafeLink(value) {
  let current = new URL(boundedText(value.trim(), 32_768));
  for (let i = 0; i < 5; i++) {
    if (!/^https?:$/.test(current.protocol))
      throw new Error("HTTP(S) URL required");
    if (!/(^|\.)safelinks\.protection\.outlook\.com$/i.test(current.hostname))
      return current.href;
    const target = current.searchParams.get("url");
    if (!target) throw new Error("SafeLink has no target URL");
    current = new URL(target);
  }
  throw new Error("Too many nested links");
}
const ROMAN = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function toRoman(input) {
  let n = Number(input);
  if (!Number.isInteger(n) || n < 1 || n > 3999)
    throw new Error("Integer must be between 1 and 3999");
  let text = "";
  for (const [v, s] of ROMAN)
    while (n >= v) {
      text += s;
      n -= v;
    }
  return text;
}
export function fromRoman(input) {
  const s = input.trim().toUpperCase();
  if (!/^[IVXLCDM]+$/.test(s)) throw new Error("Invalid Roman numeral");
  let n = 0,
    at = 0;
  for (const [v, t] of ROMAN)
    while (s.slice(at, at + t.length) === t) {
      n += v;
      at += t.length;
    }
  if (at !== s.length || toRoman(n) !== s)
    throw new Error("Invalid Roman numeral");
  return n;
}
export function randomMac(count = 1, prefix = "", separator = ":") {
  if (!Number.isInteger(count) || count < 1 || count > 1000)
    throw new Error("Count must be between 1 and 1000");
  const parts = prefix.trim() ? prefix.trim().split(/[:-]/) : [];
  if (parts.length > 5 || parts.some((p) => !/^[\da-f]{2}$/i.test(p)))
    throw new Error("Invalid MAC prefix");
  if (parts.length && parseInt(parts[0], 16) & 1)
    throw new Error("Multicast prefix is not allowed");
  const values = new Set();
  let attempts = 0;
  while (values.size < count) {
    if (++attempts > 20_000)
      throw new Error("Not enough unique addresses for this prefix");
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    if (!parts.length) bytes[0] = (bytes[0] | 2) & 254;
    parts.forEach((p, i) => (bytes[i] = parseInt(p, 16)));
    const hex = [...bytes].map((x) => x.toString(16).padStart(2, "0"));
    values.add(
      separator === "."
        ? [0, 2, 4].map((i) => hex.slice(i, i + 2).join("")).join(".")
        : hex.join(separator),
    );
  }
  return [...values].join("\n");
}
export function ipv6Ula() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  const h = [0xfd, ...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 4)}:${h.slice(4, 8)}:${h.slice(8, 12)}::/48`;
}
export function ipv4Number(ip) {
  const p = String(ip).trim().split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255))
    throw new Error("Invalid IPv4 address");
  return p.reduce((n, x) => n * 256 + Number(x), 0);
}
export function ipv4String(n) {
  return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".");
}
export function ipv4Range(start, end, { expand = false } = {}) {
  let a = typeof start === "number" ? start : ipv4Number(start),
    b = typeof end === "number" ? end : ipv4Number(end);
  if (a > b) throw new Error("Range start must not exceed end");
  if (expand) {
    if (b - a + 1 > 65_536)
      throw new Error("Address expansion is limited to 65536 addresses");
    return Array.from({ length: b - a + 1 }, (_, i) => ipv4String(a + i));
  }
  const out = [];
  while (a <= b) {
    let bits = 0;
    while (
      bits < 32 &&
      a % 2 ** (bits + 1) === 0 &&
      a + 2 ** (bits + 1) - 1 <= b
    )
      bits++;
    out.push(`${ipv4String(a)}/${32 - bits}`);
    a += 2 ** bits;
  }
  return out;
}
export function summarizeIpv4(source) {
  const ranges = boundedText(source)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((item) => {
      if (item.includes("-")) {
        const [a, b, ...extra] = item.split("-");
        if (extra.length) throw new Error("Invalid range");
        return [ipv4Number(a), ipv4Number(b)];
      }
      const [ip, mask, ...extra] = item.split("/");
      const bits = mask === undefined ? 32 : Number(mask);
      if (extra.length || !/^\d+$/.test(String(bits)) || bits < 0 || bits > 32)
        throw new Error("Invalid CIDR");
      const n = ipv4Number(ip),
        size = 2 ** (32 - bits),
        start = Math.floor(n / size) * size;
      return [start, start + size - 1];
    })
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of ranges) {
    if (a > b) throw new Error("Invalid range");
    const last = merged.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged.flatMap(([a, b]) => ipv4Range(a, b));
}
export function wifiPayload(
  ssid,
  password,
  encryption = "WPA",
  hidden = false,
) {
  if (
    !ssid ||
    new TextEncoder().encode(ssid).length > 32 ||
    password.length > 256 ||
    !["WPA", "WEP", "nopass"].includes(encryption)
  )
    throw new Error("Invalid Wi-Fi configuration");
  const esc = (s) => s.replace(/[\\;,:\"]/g, "\\$&");
  return `WIFI:T:${encryption};S:${esc(ssid)};P:${encryption === "nopass" ? "" : esc(password)};H:${hidden ? "true" : "false"};;`;
}

export const REGEX_REFERENCE = [
  ["字符类", "Character classes", "[A-Za-z]+", "Hello 123"],
  ["数字", "Digits", "\\d+", "id=42"],
  ["锚点", "Anchors", "^Hello$", "Hello"],
  ["量词", "Quantifiers", "a{2,4}", "aaaaa"],
  ["分组", "Groups", "(?<name>[A-Za-z]+)", "Alice"],
  ["反向引用", "Backreferences", "(\\w+)\\s+\\1", "hello hello"],
  ["正向预查", "Lookahead", "\\d+(?=px)", "12px 5em"],
  ["反向预查", "Lookbehind", "(?<=#)[A-Fa-f0-9]+", "#ff00aa"],
  ["非贪婪", "Lazy matching", "<.+?>", "<b>text</b>"],
];
