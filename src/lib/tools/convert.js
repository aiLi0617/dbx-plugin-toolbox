import yaml from "js-yaml";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { JSONPath } from "jsonpath-plus";

export function parseJson(text) {
  return JSON.parse(text);
}

export function runJsonPath(input, path) {
  const data = parseJson(input);
  return JSON.stringify(JSONPath({ path: path || "$", json: data }), null, 2);
}

function csvToJson(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function jsonToCsv(value) {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => (row && typeof row === "object" ? Object.keys(row) : ["value"])))];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => esc(row?.[h])).join(","))].join("\n");
}

function xmlToJson(text) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  return parser.parse(text);
}

export function jsonToXml(value) {
  const builder = new XMLBuilder({ ignoreAttributes: false, format: true, indentBy: "  " });
  const wrapped = value && typeof value === "object" && !Array.isArray(value) ? value : { root: value };
  return builder.build(wrapped);
}

export function jsonToInsert(value, table) {
  const rows = Array.isArray(value) ? value : [value];
  const name = table || "table_name";
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return `INSERT INTO ${name} (value) VALUES (${sqlLit(row)});`;
      const keys = Object.keys(row);
      const cols = keys.map((k) => `\`${k.replace(/`/g, "``")}\``).join(", ");
      const vals = keys.map((k) => sqlLit(row[k])).join(", ");
      return `INSERT INTO ${name} (${cols}) VALUES (${vals});`;
    })
    .join("\n");
}

function sqlLit(v) {
  if (v == null) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return sqlQuote(String(v));
}

function sqlQuote(text) {
  return `'${String(text ?? "").replace(/'/g, "''")}'`;
}

export function sqlEscape(text, opts = {}) {
  const raw = String(text ?? "");
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const quoted = lines.map((line) => sqlQuote(line));
  return quoted.join(opts.comma ? ",\n" : "\n");
}

export const NUMBER_BASES = [
  { id: "10", radix: 10, zh: "十进制", en: "Decimal", short: "DEC", placeholder: "255" },
  { id: "16", radix: 16, zh: "十六进制", en: "Hex", short: "HEX", placeholder: "ff" },
  { id: "8", radix: 8, zh: "八进制", en: "Octal", short: "OCT", placeholder: "377" },
  { id: "2", radix: 2, zh: "二进制", en: "Binary", short: "BIN", placeholder: "11111111" },
];

export const CUSTOM_BASE_ID = "custom";

export function clampRadix(value) {
  const radix = Number(value);
  if (!Number.isInteger(radix) || radix < 2 || radix > 36) return null;
  return radix;
}

export function parseBaseInteger(text, from) {
  const radix = clampRadix(from);
  if (!radix) throw new Error("invalid");
  let raw = String(text ?? "").trim().replace(/[\s_]+/g, "");
  if (!raw) throw new Error("empty");
  const neg = raw.startsWith("-");
  if (neg) raw = raw.slice(1);
  if (radix === 16) raw = raw.replace(/^0x/i, "");
  else if (radix === 2) raw = raw.replace(/^0b/i, "");
  else if (radix === 8) raw = raw.replace(/^0o/i, "");
  if (!raw) throw new Error("empty");
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz".slice(0, radix);
  const digits = raw.toLowerCase();
  if (![...digits].every((ch) => alphabet.includes(ch))) {
    throw new Error("invalid");
  }
  let n = 0n;
  if (radix === 10) {
    n = BigInt(digits.replace(/^0+(?=\d)/, ""));
  } else if (radix === 16) {
    n = BigInt("0x" + digits);
  } else if (radix === 2) {
    n = BigInt("0b" + digits);
  } else if (radix === 8) {
    n = BigInt("0o" + digits);
  } else {
    const base = BigInt(radix);
    for (const ch of digits) n = n * base + BigInt(alphabet.indexOf(ch));
  }
  return neg ? -n : n;
}

function groupFromRight(text, size) {
  if (size < 1 || text.length <= size) return text;
  const parts = [];
  for (let i = text.length; i > 0; i -= size) {
    parts.unshift(text.slice(Math.max(0, i - size), i));
  }
  return parts.join(" ");
}

export function formatBaseInteger(value, to, opts = {}) {
  const radix = clampRadix(to);
  if (!radix) throw new Error("invalid");
  const sign = value < 0n ? "-" : "";
  const mag = value < 0n ? -value : value;
  let body = mag.toString(radix);
  if (opts.group) {
    const size = radix === 2 ? 4 : radix === 16 ? 2 : radix === 10 || radix === 8 ? 3 : 4;
    body = groupFromRight(body, size);
  }
  let prefix = "";
  if (opts.prefix) {
    if (radix === 16) prefix = "0x";
    else if (radix === 2) prefix = "0b";
    else if (radix === 8) prefix = "0o";
  }
  return sign + prefix + body;
}

export function describeInteger(value) {
  const mag = value < 0n ? -value : value;
  const bits = value === 0n ? 1 : mag.toString(2).length;
  const bytes = Math.max(1, Math.ceil(bits / 8));
  let code = "";
  let glyph = "";
  let unicode = false;
  if (value >= 0n && value <= 0x10ffffn) {
    const cp = Number(value);
    unicode = cp > 127;
    code = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    if (cp >= 32 && cp < 127) glyph = String.fromCharCode(cp);
    else if (cp > 127 && (cp < 0xd800 || cp > 0xdfff)) glyph = String.fromCodePoint(cp);
  }
  return { bits, bytes, code, glyph, unicode };
}

export function convertBase(text, from, to) {
  return formatBaseInteger(parseBaseInteger(text, from), to);
}

export function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(Number(n))));
}

export function rgbToHex(r, g, b) {
  return (
    "#" +
    [r, g, b]
      .map((n) => clampByte(n).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function parseHexColor(text) {
  let raw = String(text ?? "").trim();
  if (raw.startsWith("#")) raw = raw.slice(1);
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (/^[0-9a-f]{8}$/i.test(raw)) raw = raw.slice(0, 6);
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return null;
}

function wrapHue(h) {
  const n = Number(h) % 360;
  return n < 0 ? n + 360 : n;
}

export function rgbToHsv(r, g, b) {
  const rr = clampByte(r) / 255;
  const gg = clampByte(g) / 255;
  const bb = clampByte(b) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}

export function hsvToRgb(h, s, v) {
  const hh = wrapHue(h);
  const ss = Math.max(0, Math.min(100, Number(s))) / 100;
  const vv = Math.max(0, Math.min(100, Number(v))) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function rgbToCmyk(r, g, b) {
  const rr = clampByte(r) / 255;
  const gg = clampByte(g) / 255;
  const bb = clampByte(b) / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1 - 1e-12) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - rr - k) / (1 - k)) * 100,
    m: ((1 - gg - k) / (1 - k)) * 100,
    y: ((1 - bb - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

export function cmykToRgb(c, m, y, k) {
  const cc = Math.max(0, Math.min(100, Number(c))) / 100;
  const mm = Math.max(0, Math.min(100, Number(m))) / 100;
  const yy = Math.max(0, Math.min(100, Number(y))) / 100;
  const kk = Math.max(0, Math.min(100, Number(k))) / 100;
  return {
    r: Math.round(255 * (1 - cc) * (1 - kk)),
    g: Math.round(255 * (1 - mm) * (1 - kk)),
    b: Math.round(255 * (1 - yy) * (1 - kk)),
  };
}

export function rgbToHsl(r, g, b) {
  const rr = clampByte(r) / 255;
  const gg = clampByte(g) / 255;
  const bb = clampByte(b) / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb(h, s, l) {
  const hh = wrapHue(h);
  const ss = Math.max(0, Math.min(1, Number(s)));
  const ll = Math.max(0, Math.min(1, Number(l)));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export function formatRgbColor(r, g, b) {
  r = clampByte(r);
  g = clampByte(g);
  b = clampByte(b);
  const hex = rgbToHex(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const cmyk = rgbToCmyk(r, g, b);
  const hsl = rgbToHsl(r, g, b);
  const ri = (n) => Math.round(n);
  const hsvR = { h: ri(hsv.h), s: ri(hsv.s), v: ri(hsv.v) };
  const cmykR = { c: ri(cmyk.c), m: ri(cmyk.m), y: ri(cmyk.y), k: ri(cmyk.k) };
  return {
    r,
    g,
    b,
    hex,
    hexBody: hex.slice(1),
    rgbCss: `rgb(${r}, ${g}, ${b})`,
    hslCss: `hsl(${ri(hsl.h)}, ${ri(hsl.s * 100)}%, ${ri(hsl.l * 100)}%)`,
    cmyk: cmykR,
    hsv: hsvR,
    cmykCss: `cmyk(${cmykR.c}%, ${cmykR.m}%, ${cmykR.y}%, ${cmykR.k}%)`,
    hsvCss: `hsv(${hsvR.h}°, ${hsvR.s}%, ${hsvR.v}%)`,
  };
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function intField(value, name, min, max) {
  const n = Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`invalid ${name}`);
  }
  return n;
}

export function beijingPartsFromMs(ms) {
  const d = new Date(Number(ms) + BEIJING_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
  };
}

export function msFromBeijingParts(parts) {
  const year = intField(parts.year, "year", 1, 9999);
  const month = intField(parts.month, "month", 1, 12);
  const day = intField(parts.day, "day", 1, 31);
  const hour = intField(parts.hour, "hour", 0, 23);
  const minute = intField(parts.minute, "minute", 0, 59);
  const second = intField(parts.second, "second", 0, 59);
  const ms = parts.ms == null || parts.ms === "" ? 0 : intField(parts.ms, "ms", 0, 999);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second ||
    check.getUTCMilliseconds() !== ms
  ) {
    throw new Error("invalid date");
  }
  return utc - BEIJING_OFFSET_MS;
}

export function formatBeijingDate(ms, unit = "s") {
  const p = beijingPartsFromMs(ms);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const text = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  return unit === "ms" ? `${text}.${pad(p.ms, 3)}` : text;
}

export function formatUnix(ms, unit = "s") {
  const n = Number(ms);
  if (!Number.isFinite(n)) throw new Error("invalid time");
  return unit === "ms" ? String(Math.trunc(n)) : String(Math.trunc(n / 1000));
}

export function parseUnixToMs(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty");
  if (!/^-?\d+$/.test(raw)) throw new Error("invalid timestamp");
  const digits = raw.startsWith("-") ? raw.slice(1) : raw;
  if (!digits) throw new Error("invalid timestamp");
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new Error("invalid timestamp");
  return digits.length >= 13 ? n : n * 1000;
}

function padFracMs(frac) {
  if (frac == null || frac === "") return 0;
  return intField(String(frac).padEnd(3, "0").slice(0, 3), "ms", 0, 999);
}

function parseIsoInstant(raw) {
  const m = String(raw)
    .trim()
    .match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)\s*(Z|[+-]\d{2}:?\d{2})$/i);
  if (!m) return null;
  let time = m[2];
  if (/^\d{2}:\d{2}$/.test(time)) time += ":00";
  const frac = time.match(/\.(\d+)/);
  if (frac) time = time.replace(/\.\d+/, `.${frac[1].padEnd(3, "0").slice(0, 3)}`);
  let tz = m[3].toUpperCase();
  if (tz !== "Z" && tz.length === 5) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const ms = Date.parse(`${m[1]}T${time}${tz}`);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeBeijingDateText(text) {
  return String(text)
    .trim()
    .replace(/[年]/g, "-")
    .replace(/[月]/g, "-")
    .replace(/[日]/g, " ")
    .replace(/[时点]/g, ":")
    .replace(/[分]/g, ":")
    .replace(/秒/g, "")
    .replace(/T/gi, " ")
    .replace(/\//g, "-")
    .replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/, "$1-$2-$3")
    .replace(/\s+/g, " ")
    .trim();
}

function partsFromDateMatch(m) {
  return {
    year: m[1],
    month: m[2],
    day: m[3],
    hour: m[4] ?? 0,
    minute: m[5] ?? 0,
    second: m[6] ?? 0,
    ms: padFracMs(m[7]),
  };
}

function partsFromCompactDigits(digits) {
  if (digits.length === 8) {
    return { year: digits.slice(0, 4), month: digits.slice(4, 6), day: digits.slice(6, 8), hour: 0, minute: 0, second: 0 };
  }
  if (digits.length === 12) {
    return {
      year: digits.slice(0, 4),
      month: digits.slice(4, 6),
      day: digits.slice(6, 8),
      hour: digits.slice(8, 10),
      minute: digits.slice(10, 12),
      second: 0,
    };
  }
  if (digits.length === 14 || digits.length === 17) {
    return {
      year: digits.slice(0, 4),
      month: digits.slice(4, 6),
      day: digits.slice(6, 8),
      hour: digits.slice(8, 10),
      minute: digits.slice(10, 12),
      second: digits.slice(12, 14),
      ms: digits.length === 17 ? digits.slice(14, 17) : 0,
    };
  }
  return null;
}

export function parseCompactBeijing(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty");

  const instant = parseIsoInstant(raw);
  if (instant != null) return instant;

  const normalized = normalizeBeijingDateText(raw);
  const dated = normalized.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?: (\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,9}))?)?)?$/,
  );
  if (dated) return msFromBeijingParts(partsFromDateMatch(dated));

  const compact = partsFromCompactDigits(raw.replace(/\D/g, ""));
  if (compact) return msFromBeijingParts(compact);
  throw new Error("invalid compact");
}

export const jsonConvertModes = [
  { value: "json-yaml", zh: "JSON → YAML", en: "JSON → YAML" },
  { value: "yaml-json", zh: "YAML → JSON", en: "YAML → JSON" },
  { value: "json-csv", zh: "JSON → CSV", en: "JSON → CSV" },
  { value: "csv-json", zh: "CSV → JSON", en: "CSV → JSON" },
  { value: "json-xml", zh: "JSON → XML", en: "JSON → XML" },
  { value: "xml-json", zh: "XML → JSON", en: "XML → JSON" },
  { value: "json-toml", zh: "JSON → TOML", en: "JSON → TOML" },
  { value: "toml-json", zh: "TOML → JSON", en: "TOML → JSON" },
  { value: "json-sql", zh: "JSON → SQL INSERT", en: "JSON → SQL INSERT" },
  { value: "json-ts", zh: "JSON → TypeScript", en: "JSON → TypeScript" },
];

export const jsonToJsonModes = new Set(["yaml-json", "csv-json", "xml-json", "toml-json"]);

export function runJsonConvert(input, opts) {
  switch (opts.mode) {
    case "yaml-json":
      return JSON.stringify(yaml.load(input), null, 2);
    case "json-csv":
      return jsonToCsv(parseJson(input));
    case "csv-json":
      return JSON.stringify(csvToJson(input), null, 2);
    case "json-xml":
      return jsonToXml(parseJson(input));
    case "xml-json":
      return JSON.stringify(xmlToJson(input), null, 2);
    case "json-toml":
      return stringifyToml(parseJson(input));
    case "toml-json":
      return JSON.stringify(parseToml(input), null, 2);
    case "json-sql":
      return jsonToInsert(parseJson(input), opts.table);
    case "json-ts":
      return inferTs(parseJson(input));
    default:
      return yaml.dump(parseJson(input));
  }
}

export const convertTools = [
  {
    id: "jsonpath",
    category: "convert",
    phase: "p1",
    name: { zh: "JSONPath 提取", en: "JSONPath" },
    view: "jsonpath",
  },
  {
    id: "base-convert",
    category: "convert",
    phase: "p0",
    name: { zh: "进制转换", en: "Number base" },
    view: "base-convert",
  },
  {
    id: "timestamp",
    category: "convert",
    phase: "p0",
    name: { zh: "时间转换", en: "Time convert" },
    aliases: ["duration", "unix", "time", "beijing"],
    view: "time-convert",
  },
  {
    id: "color",
    category: "convert",
    phase: "p0",
    name: { zh: "颜色转换", en: "Color convert" },
    aliases: ["hex", "rgb", "hsl", "hsv", "cmyk", "colour", "eyedropper", "picker"],
    view: "color-convert",
  },
  {
    id: "cron",
    category: "convert",
    phase: "p0",
    name: { zh: "Cron 解释", en: "Cron" },
    view: "cron",
  },
  {
    id: "sql-escape",
    category: "convert",
    phase: "p1",
    name: { zh: "SQL 字符串转义", en: "SQL string escape" },
    aliases: ["sql", "in", "quote"],
    view: "live-io",
  },
];

function inferTs(value, name = "Root") {
  const walk = (v) => {
    if (v === null) return "null";
    if (Array.isArray(v)) {
      if (!v.length) return "unknown[]";
      const inner = [...new Set(v.slice(0, 20).map(walk))];
      return inner.length === 1 ? `${inner[0]}[]` : `(${inner.join(" | ")})[]`;
    }
    if (typeof v === "object") {
      const fields = Object.entries(v)
        .map(([k, val]) => `  ${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}: ${walk(val)};`)
        .join("\n");
      return `{\n${fields}\n}`;
    }
    return typeof v;
  };
  return `type ${name} = ${walk(value)};`;
}
