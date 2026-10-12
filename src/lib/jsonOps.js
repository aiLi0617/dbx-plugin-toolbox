import { isLosslessNumber, parseLosslessJson, parseSafeJson, stringifyLosslessJson } from "./jsonPrecision.js";
import { pick } from './locale.js';

export function isContainer(value) {
  return value !== null && typeof value === "object" && !isLosslessNumber(value);
}

export function childCount(value) {
  if (Array.isArray(value)) return value.length;
  if (isContainer(value)) return Object.keys(value).length;
  return 0;
}

function decodeWholeEscapedJson(source) {
  if (!source.includes("\\")) return undefined;
  try {
    const safeControls = source.replace(/[\u0000-\u001f]/g, (char) => {
      if (char === "\n") return "\\n";
      if (char === "\r") return "\\r";
      if (char === "\t") return "\\t";
      return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    });
    const decoded = JSON.parse(`"${safeControls}"`);
    return decoded === source ? undefined : decoded;
  } catch {
    return undefined;
  }
}

function repairEmbeddedJsonSource(source) {
  let output = "";
  let inString = false;
  let escaped = false;
  let stringRole = "value";
  let lastToken = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (!inString) {
      output += char;
      if (char === '"') {
        inString = true;
        escaped = false;
        stringRole = lastToken === "{" || lastToken === "," ? "key" : "value";
      } else if (!/\s/.test(char)) {
        lastToken = char;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === "\n" || char === "\r" || char === "\t" || char.charCodeAt(0) < 0x20) {
      if (char === "\n") output += "\\n";
      else if (char === "\r") output += "\\r";
      else if (char === "\t") output += "\\t";
      else output += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      continue;
    }
    if (char === '"') {
      let next = index + 1;
      while (next < source.length && /\s/.test(source[next])) next += 1;
      if (stringRole === "value" && source[next] === ":") {
        output += '\\"';
        continue;
      }
      inString = false;
      lastToken = '"';
    }
    output += char;
  }
  return output;
}

function parseEmbeddedCandidate(source) {
  const candidates = [source];
  if (source.length >= 2 && source.startsWith('"') && source.endsWith('"')) {
    candidates.push(source.slice(1, -1));
  }
  for (const candidate of [...candidates]) {
    const decoded = decodeWholeEscapedJson(candidate);
    if (decoded !== undefined) candidates.push(decoded);
  }
  let lastError;
  for (const candidate of [...new Set(candidates)]) {
    try {
      return parseLosslessJson(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  for (const candidate of [...new Set(candidates)]) {
    const repaired = repairEmbeddedJsonSource(candidate);
    if (repaired === candidate) continue;
    try {
      return parseLosslessJson(repaired);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function resemblesEmbeddedContainer(source) {
  const probe = String(source ?? "")
    .trim()
    .replace(/^"+/, "")
    .replace(/^\\"+/, "")
    .trimStart();
  return probe.startsWith("{") || probe.startsWith("[");
}

/**
 * Parse a JSON object/array stored inside a string.
 *
 * Primitive JSON strings such as "true" and "123" intentionally stay as
 * ordinary leaves: expanding those values would be surprising and provides
 * little value in the tree editor.
 */
export function parseEmbeddedJsonInfo(value, maxLayers = 8) {
  if (typeof value !== "string") return undefined;
  let current = value;
  for (let layers = 1; layers <= maxLayers; layers += 1) {
    const source = current.trim();
    if (!source) return undefined;
    try {
      const parsed = parseEmbeddedCandidate(source);
      if (isContainer(parsed)) return { value: parsed, layers };
      if (typeof parsed !== "string") return undefined;
      current = parsed;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function parseEmbeddedJson(value) {
  return parseEmbeddedJsonInfo(value)?.value;
}

export function embeddedJsonParseError(value, maxLayers = 8) {
  if (typeof value !== "string") return "";
  let current = value;
  for (let layers = 1; layers <= maxLayers; layers += 1) {
    const source = current.trim();
    if (!source) return "";
    try {
      const parsed = parseEmbeddedCandidate(source);
      if (isContainer(parsed) || typeof parsed !== "string") return "";
      current = parsed;
    } catch (error) {
      return resemblesEmbeddedContainer(source) ? String(error?.message || error) : "";
    }
  }
  return "";
}

export function serializeEmbeddedJson(value, layers = 1) {
  let serialized = serializeJson(value, false);
  for (let layer = 1; layer < Math.max(1, layers); layer += 1) {
    serialized = serializeJson(serialized, false);
  }
  return serialized;
}

export function encodePointer(seg) {
  return String(seg).replace(/~/g, "~0").replace(/\//g, "~1");
}

export function splitPointer(path) {
  if (!path) return [];
  return path
    .slice(path.startsWith("/") ? 1 : 0)
    .split("/")
    .filter((part) => part.length)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function walkContainers(value, path, visit, depth = 0, embeddedDepth = 0) {
  const embeddedInfo = embeddedDepth < 8 ? parseEmbeddedJsonInfo(value, 8 - embeddedDepth) : undefined;
  const embedded = embeddedInfo?.value;
  const node = embedded ?? value;
  if (!isContainer(node)) return;
  visit(path, node, depth, embedded !== undefined);
  const entries = Array.isArray(node) ? node.map((item, i) => [String(i), item]) : Object.entries(node);
  for (const [key, child] of entries) {
    walkContainers(child, `${path}/${encodePointer(key)}`, visit, depth + 1, embeddedDepth + (embeddedInfo?.layers ?? 0));
  }
}

export function defaultCollapsed(value) {
  const next = {};
  walkContainers(value, "", (path, _node, depth, embedded) => {
    if (path && (embedded || depth >= 2)) next[path] = true;
  });
  return next;
}

export function collapseAllPaths(value) {
  const next = {};
  walkContainers(value, "", (path) => {
    // The root is a real foldable node too. Keep it in the collapse map so
    // the toolbar's "collapse all" action also handles a top-level object or
    // array instead of leaving that node expanded.
    next[path] = true;
  });
  return next;
}

function cloneJson(value) {
  return parseLosslessJson(stringifyLosslessJson(value));
}

function parentAndKey(root, path) {
  const segs = splitPointer(path);
  if (!segs.length) return { parent: null, key: null, segs };
  const key = segs[segs.length - 1];
  let parent = root;
  for (let i = 0; i < segs.length - 1; i++) parent = parent?.[segs[i]];
  return { parent, key, segs };
}

export function deletePath(root, path) {
  const segs = splitPointer(path);
  if (!segs.length) return root;
  const clone = cloneJson(root);
  const { parent, key } = parentAndKey(clone, path);
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else if (parent && typeof parent === "object") delete parent[key];
  return clone;
}

export function setPath(root, path, value) {
  const segs = splitPointer(path);
  if (!segs.length) return value;
  const clone = cloneJson(root);
  const { parent, key } = parentAndKey(clone, path);
  if (Array.isArray(parent)) parent[Number(key)] = value;
  else if (parent && typeof parent === "object") parent[key] = value;
  return clone;
}

export function uniqueObjectKey(obj, base) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return base;
  if (!Object.prototype.hasOwnProperty.call(obj, base)) return base;
  let i = 2;
  while (Object.prototype.hasOwnProperty.call(obj, `${base}${i}`)) i += 1;
  return `${base}${i}`;
}

function nodeAt(root, path) {
  if (!path) return root;
  let cur = root;
  for (const seg of splitPointer(path)) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
}

export function addChild(root, path, locale = "zh-CN") {
  const keyBase = pick(locale, "新的属性", "new_key");
  const leaf = pick(locale, "新的属性值", "new value");
  const clone = cloneJson(root);
  const target = nodeAt(clone, path);
  if (!isContainer(target)) return clone;
  if (Array.isArray(target)) target.push(leaf);
  else target[uniqueObjectKey(target, keyBase)] = leaf;
  return clone;
}

export function renamePath(root, path, nextKey) {
  const name = String(nextKey ?? "").trim();
  const segs = splitPointer(path);
  if (!segs.length || !name) return root;
  const clone = cloneJson(root);
  const { parent, key } = parentAndKey(clone, path);
  if (!parent || Array.isArray(parent) || typeof parent !== "object") return clone;
  if (key === name) return clone;
  const finalKey = Object.prototype.hasOwnProperty.call(parent, name)
    ? uniqueObjectKey(parent, name)
    : name;
  const next = {};
  for (const [k, v] of Object.entries(parent)) next[k === key ? finalKey : k] = v;
  for (const k of Object.keys(parent)) delete parent[k];
  Object.assign(parent, next);
  return clone;
}

export function parseLeaf(text) {
  const raw = text.trim();
  if (!raw.length) return "";
  try {
    return parseSafeJson(raw);
  } catch (err) {
    if (err?.code === "UNSAFE_NUMBER") return parseLosslessJson(raw);
    return text;
  }
}

/** Auto escape preserves edited string fields as strings; non-string fields still retain JSON type inference. */
export function parseTreeEdit(text, preserveString = false, originalValue = undefined) {
  return preserveString && typeof originalValue === "string" ? String(text) : parseLeaf(text);
}

function isIdentChar(ch) {
  return ch != null && /[A-Za-z0-9_]/.test(ch);
}

export function tokenizeJson(text) {
  const src = String(text ?? "");
  const tokens = [];
  const n = src.length;
  let i = 0;

  const push = (type, start, end) => {
    if (end > start) tokens.push({ type, text: src.slice(start, end) });
  };

  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      const start = i;
      i += 1;
      while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r")) i += 1;
      push("ws", start, i);
      continue;
    }
    if ("{}[],:".includes(ch)) {
      push("punct", i, i + 1);
      i += 1;
      continue;
    }
    if (ch === '"') {
      const start = i;
      i += 1;
      while (i < n) {
        if (src[i] === "\\") {
          i += i + 1 < n ? 2 : 1;
          continue;
        }
        if (src[i] === '"') {
          i += 1;
          break;
        }
        i += 1;
      }
      let j = i;
      while (j < n && (src[j] === " " || src[j] === "\t" || src[j] === "\n" || src[j] === "\r")) j += 1;
      push(src[j] === ":" ? "key" : "string", start, i);
      continue;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const start = i;
      if (ch === "-") i += 1;
      while (
        i < n &&
        ((src[i] >= "0" && src[i] <= "9") || src[i] === "." || src[i] === "e" || src[i] === "E" || src[i] === "+" || src[i] === "-")
      ) {
        i += 1;
      }
      push("number", start, i);
      continue;
    }
    if (src.startsWith("true", i) && !isIdentChar(src[i + 4])) {
      push("boolean", i, i + 4);
      i += 4;
      continue;
    }
    if (src.startsWith("false", i) && !isIdentChar(src[i + 5])) {
      push("boolean", i, i + 5);
      i += 5;
      continue;
    }
    if (src.startsWith("null", i) && !isIdentChar(src[i + 4])) {
      push("null", i, i + 4);
      i += 4;
      continue;
    }
    if (ch === "…") {
      push("punct", i, i + 1);
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    while (i < n && !'{}[],:" \t\n\r'.includes(src[i])) i += 1;
    push("error", start, i);
  }
  return tokens;
}

export function sortValue(value, dir = "asc") {
  if (dir !== "asc" && dir !== "desc") return value;
  const cmp = dir === "desc" ? (a, b) => b.localeCompare(a) : (a, b) => a.localeCompare(b);
  if (Array.isArray(value)) return value.map((item) => sortValue(item, dir));
  if (isContainer(value)) {
    return Object.keys(value)
      .sort(cmp)
      .reduce((acc, key) => {
        acc[key] = sortValue(value[key], dir);
        return acc;
      }, Object.create(null));
  }
  return value;
}

export function restoreKeyOrder(value, original) {
  if (Array.isArray(value)) {
    const orig = Array.isArray(original) ? original : [];
    return value.map((item, i) => restoreKeyOrder(item, orig[i]));
  }
  if (isContainer(value)) {
    const orig = original && typeof original === "object" && !Array.isArray(original) ? original : {};
    const seen = new Set();
    const keys = [];
    for (const key of Object.keys(orig)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        keys.push(key);
        seen.add(key);
      }
    }
    for (const key of Object.keys(value)) {
      if (!seen.has(key)) keys.push(key);
    }
    const next = Object.create(null);
    for (const key of keys) next[key] = restoreKeyOrder(value[key], orig[key]);
    return next;
  }
  return value;
}

function sortDir(sortKeys) {
  if (sortKeys === true || sortKeys === "asc") return "asc";
  if (sortKeys === "desc") return "desc";
  return false;
}

export function formatJson(text, indent = 2, sortKeys = false) {
  let value = parseLosslessJson(text);
  const dir = sortDir(sortKeys);
  if (dir) value = sortValue(value, dir);
  return stringifyLosslessJson(value, indent);
}

export function minifyJson(text, sortKeys = false) {
  let value = parseLosslessJson(text);
  const dir = sortDir(sortKeys);
  if (dir) value = sortValue(value, dir);
  return stringifyLosslessJson(value);
}

export function serializeJson(value, pretty = true, sortKeys = false) {
  const dir = sortDir(sortKeys);
  const next = dir ? sortValue(value, dir) : value;
  return stringifyLosslessJson(next, pretty ? 2 : undefined);
}

export function chineseToUnicode(text) {
  return [...text]
    .map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) return ch;
      if (cp > 0xffff) {
        const hi = 0xd800 + ((cp - 0x10000) >> 10);
        const lo = 0xdc00 + ((cp - 0x10000) & 0x3ff);
        return `\\u${hi.toString(16).padStart(4, "0")}\\u${lo.toString(16).padStart(4, "0")}`;
      }
      return `\\u${cp.toString(16).padStart(4, "0")}`;
    })
    .join("");
}

export function unicodeToChinese(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
    const cp = parseInt(hex, 16);
    if (cp < 0x80) return match;
    return String.fromCharCode(cp);
  });
}

export function addJsonEscape(text) {
  return JSON.stringify(text).slice(1, -1);
}

export function removeJsonEscape(text) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") return parsed;
  } catch {
    /* try wrapping as a JSON string */
  }
  try {
    return JSON.parse(`"${trimmed}"`);
  } catch {
    throw new Error("Text is not an escaped JSON string");
  }
}

export function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function jsonFoldLines(value, indent = 2) {
  const lines = [];
  const walk = (val, path, key, depth, isLast) => {
    const pad = " ".repeat(indent * depth);
    const prefix = key !== undefined ? `${JSON.stringify(key)}: ` : "";
    const comma = isLast ? "" : ",";
    if (!isContainer(val)) {
      lines.push({
        path,
        foldable: false,
        kind: "leaf",
        text: `${pad}${prefix}${stringifyLosslessJson(val)}${comma}`,
      });
      return;
    }
    const open = Array.isArray(val) ? "[" : "{";
    const close = Array.isArray(val) ? "]" : "}";
    const n = childCount(val);
    if (n === 0) {
      lines.push({
        path,
        foldable: false,
        kind: "empty",
        text: `${pad}${prefix}${open}${close}${comma}`,
      });
      return;
    }
    lines.push({
      path,
      foldable: true,
      kind: "open",
      close,
      count: n,
      text: `${pad}${prefix}${open}`,
    });
    const entries = Array.isArray(val)
      ? val.map((child, i) => [String(i), child, undefined])
      : Object.entries(val).map(([childKey, child]) => [childKey, child, childKey]);
    entries.forEach(([childKey, child, displayKey], i) => {
      walk(child, `${path}/${encodePointer(childKey)}`, displayKey, depth + 1, i === entries.length - 1);
    });
    lines.push({
      path,
      foldable: false,
      kind: "close",
      text: `${pad}${close}${comma}`,
    });
  };
  walk(value, "", undefined, 0, true);
  return lines;
}

export function visibleFoldLines(lines, collapsed) {
  const out = [];
  const skipping = [];
  for (const line of lines) {
    if (skipping.length) {
      if (line.kind === "close" && line.path === skipping[skipping.length - 1]) skipping.pop();
      continue;
    }
    if (line.kind === "open" && collapsed[line.path]) {
      out.push({
        ...line,
        folded: true,
        text: `${line.text} … ${line.close}`,
      });
      skipping.push(line.path);
      continue;
    }
    out.push(line);
  }
  return out;
}

export function jsonTextFolds(text) {
  const lines = String(text || "").split("\n");
  const foldable = {};
  const stack = [];
  let inString = false;
  let escape = false;
  for (let line = 0; line < lines.length; line++) {
    const row = lines[line];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") stack.push(line);
      else if (ch === "}" || ch === "]") {
        const start = stack.pop();
        if (start != null && line > start) foldable[start] = line;
      }
    }
  }
  return { lines, foldable };
}

export function visibleTextLines(lines, foldable, collapsed) {
  const hidden = new Array(lines.length).fill(false);
  for (const [start, end] of Object.entries(foldable)) {
    if (!collapsed[start]) continue;
    const from = Number(start);
    for (let i = from + 1; i <= end && i < lines.length; i++) hidden[i] = true;
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (hidden[i]) continue;
    const folded = foldable[i] != null && Boolean(collapsed[i]);
    out.push({
      no: i + 1,
      start: i,
      text: folded ? `${lines[i]} …` : lines[i],
      foldable: foldable[i] != null,
      folded,
    });
  }
  return out;
}

export function hoverRelation(path, hoverPath) {
  if (hoverPath == null) return "none";
  if (hoverPath === path) return "self";
  if (!path) return "ancestor";
  if (hoverPath.startsWith(`${path}/`)) return "ancestor";
  return "none";
}

export function hoverDistance(path, hoverPath) {
  if (hoverPath == null) return 0;
  const segs = (p) => (p ? splitPointer(p).length : 0);
  return Math.max(0, segs(hoverPath) - segs(path));
}

/** Hovered node is darkest; each ancestor is lighter. Floor keeps deep trees from going black. */
export function hoverTint(distance) {
  return Math.max(4, 13 - distance * 3);
}
