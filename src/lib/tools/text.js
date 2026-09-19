import { diffChars, diffLines, diffWordsWithSpace } from "diff";
import { marked } from "marked";
export { slugify, stripHtml } from "../simpleTransforms.js";

export function toCase(text, mode) {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return text;
}

export function naming(text, style) {
  const parts = text
    .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, "$1 $2")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.toLocaleLowerCase());
  if (!parts.length) return "";
  if (style === "camel") return parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join("");
  if (style === "pascal") return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
  if (style === "snake") return parts.join("_");
  if (style === "kebab") return parts.join("-");
  return parts.join(" ");
}

export const CASE_STYLES = [
  { id: "upper", zh: "大写", en: "UPPER" },
  { id: "lower", zh: "小写", en: "lower" },
  { id: "title", zh: "标题", en: "Title" },
  { id: "camel", zh: "camelCase", en: "camelCase" },
  { id: "pascal", zh: "PascalCase", en: "PascalCase" },
  { id: "snake", zh: "snake_case", en: "snake_case" },
  { id: "kebab", zh: "kebab-case", en: "kebab-case" },
];

export function applyCaseStyle(text, mode) {
  if (["camel", "pascal", "snake", "kebab"].includes(mode)) return naming(text, mode);
  return toCase(text, mode);
}

export function whitespace(text, mode) {
  if (mode === "trim") return text.trim();
  if (mode === "empty") return text.split(/\r?\n/).filter((l) => l.trim().length).join("\n");
  if (mode === "tabs") return text.replace(/ {2,}/g, "\t");
  if (mode === "spaces") return text.replace(/\t/g, "  ");
  return text;
}

const WORD_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z0-9_]+(?:['’][A-Za-z]+)?|\p{L}+/gu;

function countWords(value) {
  if (!value.trim()) return 0;
  const tokens = value.match(WORD_RE);
  return tokens ? tokens.length : 0;
}

export function textStats(text) {
  const value = String(text ?? "");
  const chars = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)].length
    : [...value].length;
  const bytes = new TextEncoder().encode(value).length;
  const words = countWords(value);
  const lines = value ? value.split(/\r?\n/).length : 0;
  return { chars, bytes, words, lines };
}

export function lineOps(text, mode, opts = {}) {
  let lines = text.split(/\r?\n/);
  if (mode === "sort") lines = [...lines].sort((a, b) => a.localeCompare(b));
  if (mode === "unique") lines = [...new Set(lines)];
  if (mode === "prefix") lines = lines.map((l) => (opts.affix || "") + l);
  if (mode === "suffix") lines = lines.map((l) => l + (opts.affix || ""));
  if (mode === "reverse") lines = [...lines].reverse();
  if (mode === "shuffle") {
    lines = [...lines];
    for (let i = lines.length - 1; i > 0; i -= 1) {
      const j = Math.floor((opts.random?.() ?? Math.random()) * (i + 1));
      [lines[i], lines[j]] = [lines[j], lines[i]];
    }
  }
  if (mode === "number") {
    const start = Number.isFinite(Number(opts.start)) ? Math.trunc(Number(opts.start)) : 1;
    const width = Math.max(0, Math.min(12, Math.trunc(Number(opts.width) || 0)));
    const separator = opts.separator ?? ". ";
    lines = lines.map((line, index) => `${String(start + index).padStart(width, "0")}${separator}${line}`);
  }
  if (mode === "unnumber") lines = lines.map((line) => line.replace(/^\s*\d+\s*(?:[.)、:：_-]\s*|\s+)/u, ""));
  if (mode === "column") {
    const column = Math.max(1, Math.trunc(Number(opts.column) || 1)) - 1;
    const delimiter = String(opts.delimiter ?? "");
    lines = lines.map((line) => (delimiter ? line.split(delimiter) : line.trim().split(/\s+/))[column] ?? "");
  }
  if (mode === "filter-length") {
    const min = Math.max(0, Math.trunc(Number(opts.minLength) || 0));
    const rawMax = Number(opts.maxLength);
    const max = Number.isFinite(rawMax) && rawMax >= 0 ? Math.trunc(rawMax) : Infinity;
    const lengthOf = (line) => typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(line)].length
      : [...line].length;
    lines = lines.filter((line) => lengthOf(line) >= min && lengthOf(line) <= max);
  }
  return lines.join("\n");
}

export function punct(text, mode) {
  const map = {
    ",": "，",
    ".": "。",
    "?": "？",
    "!": "！",
    ":": "：",
    ";": "；",
    "(": "（",
    ")": "）",
  };
  if (mode === "full") {
    return text.replace(/[!-~\u0020]/g, (ch) => {
      const c = ch.charCodeAt(0);
      if (c === 32) return "\u3000";
      if (map[ch]) return map[ch];
      if (c >= 33 && c <= 126) return String.fromCharCode(c + 0xfee0);
      return ch;
    });
  }
  const reverse = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
  return text.replace(/[\u3000\uFF01-\uFF5E\u3002\uFF0C\uFF1F\uFF01\uFF1A\uFF1B\uFF08\uFF09]/g, (ch) => {
    if (ch === "\u3000") return " ";
    if (reverse[ch]) return reverse[ch];
    const c = ch.charCodeAt(0);
    if (c >= 0xff01 && c <= 0xff5e) return String.fromCharCode(c - 0xfee0);
    return ch;
  });
}

export function inspectUnicodeRows(text) {
  return [...String(text ?? "")].map((ch) => {
    const cp = ch.codePointAt(0);
    return {
      char: ch,
      hex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
      dec: cp,
    };
  });
}

const MARKDOWN_REMOVE_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "TEXTAREA", "SVG", "MATH", "BASE",
]);

const MARKDOWN_KEEP_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "H1", "H2", "H3", "H4", "H5", "H6",
  "HR", "I", "IMG", "INPUT", "INS", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "SUB", "SUP",
  "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
]);

const MARKDOWN_ATTRS = {
  A: new Set(["href", "title", "rel", "target"]),
  IMG: new Set(["src", "alt", "title", "loading", "referrerpolicy"]),
  TH: new Set(["colspan", "rowspan", "align"]),
  TD: new Set(["colspan", "rowspan", "align"]),
  OL: new Set(["start"]),
  LI: new Set(["value"]),
  CODE: new Set(["class"]),
  PRE: new Set(["class"]),
  INPUT: new Set(["type", "checked", "disabled"]),
};

function safeUrl(value, kind) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("#")) return url;
  const lower = url.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) return "";
  // SVG is active XML in several embedding/navigation contexts. Markdown
  // previews only need inert raster images, so keep the allowlist explicit.
  if (kind === "img") return /^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(url) ? url : "";
  return /^(https?:|mailto:)/i.test(url) ? url : "";
}

function sanitizeElement(el) {
  const tag = el.tagName;
  if (MARKDOWN_REMOVE_TAGS.has(tag)) {
    el.remove();
    return;
  }

  for (const child of [...el.children]) sanitizeElement(child);

  if (!el.parentNode) return;

  if (!MARKDOWN_KEEP_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) {
      el.remove();
      return;
    }
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    return;
  }

  const allowed = MARKDOWN_ATTRS[tag];
  for (const attr of [...el.attributes]) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "srcdoc" || !allowed?.has(name)) {
      el.removeAttribute(attr.name);
    }
  }

  if (tag === "A") {
    const href = safeUrl(el.getAttribute("href"), "a");
    if (href) {
      el.setAttribute("href", href);
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    } else {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
      }
      el.remove();
    }
  } else if (tag === "IMG") {
    const src = safeUrl(el.getAttribute("src"), "img");
    if (src) {
      el.setAttribute("src", src);
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
    }
    else el.remove();
  } else if (tag === "INPUT") {
    if (el.getAttribute("type") !== "checkbox") {
      el.remove();
      return;
    }
    el.setAttribute("type", "checkbox");
    el.setAttribute("disabled", "");
    if (el.hasAttribute("checked")) el.setAttribute("checked", "");
  }
}

function sanitizeHtml(html) {
  if (typeof document === "undefined") return "";
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  root.innerHTML = String(html ?? "");
  for (const child of [...root.children]) sanitizeElement(child);
  return root.innerHTML;
}

export function renderMarkdown(source) {
  const text = String(source ?? "");
  if (!text) return "";
  if (text.length > 1_000_000) throw new Error("Markdown input is limited to 1 MB");
  return sanitizeHtml(marked.parse(text, { async: false, gfm: true }));
}

export const TEXT_CLEANUP_KINDS = [
  { value: "lines", zh: "空白与行", en: "Lines" },
  { value: "replace", zh: "查找替换", en: "Replace" },
  { value: "punct", zh: "全半角", en: "Width" },
];

export const LINE_SPACE_MODES = [
  { value: "trim", zh: "trim", en: "trim" },
  { value: "empty", zh: "去空行", en: "Empty lines" },
  { value: "tabs", zh: "空格 → Tab", en: "Spaces → Tab" },
  { value: "spaces", zh: "Tab → 空格", en: "Tab → spaces" },
];

export const LINE_ROW_MODES = [
  { value: "sort", zh: "排序", en: "Sort" },
  { value: "unique", zh: "去重", en: "Unique" },
  { value: "prefix", zh: "前缀", en: "Prefix" },
  { value: "suffix", zh: "后缀", en: "Suffix" },
  { value: "reverse", zh: "倒序", en: "Reverse" },
];

export const PUNCT_MODES = [
  { value: "full", zh: "转全角", en: "Fullwidth" },
  { value: "half", zh: "转半角", en: "Halfwidth" },
];

export function applyWhitespace(text, mode, opts = {}) {
  const kind = mode || "trim";
  const options = typeof opts === "string" ? { affix: opts } : opts || {};
  if (kind === "replace") return findReplace(text, options.find, options.replace);
  if (kind === "full" || kind === "half") return punct(text, kind);
  if (["sort", "unique", "prefix", "suffix", "reverse", "shuffle", "number", "unnumber", "column", "filter-length"].includes(kind)) {
    return lineOps(text, kind, options);
  }
  return whitespace(text, kind);
}

export function findReplace(text, find, replace) {
  if (!find) return text;
  return String(text ?? "").split(find).join(replace || "");
}

export function testRegex(input, pattern, flags) {
  if (String(pattern ?? "").length > 10_000) throw new Error("Regex pattern is too large");
  if (String(input ?? "").length > 1_000_000) throw new Error("Regex input is limited to 1 MB");
  const re = new RegExp(pattern || ".*", flags || "");
  const text = String(input ?? "");
  const matches = [];
  if (re.global) {
    for (const m of text.matchAll(re)) {
      matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1) });
      if (matches.length >= 10_000) break;
    }
  } else {
    const m = text.match(re);
    if (m) matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1) });
  }
  return { matches };
}

export function regexSegments(text, matches) {
  const value = String(text ?? "");
  const segs = [];
  let last = 0;
  for (const m of matches) {
    const start = Math.max(0, m.index ?? 0);
    if (start < last) continue;
    if (start > last) segs.push({ text: value.slice(last, start), hit: false });
    segs.push({ text: m.text, hit: true });
    last = start + String(m.text ?? "").length;
  }
  if (last < value.length) segs.push({ text: value.slice(last), hit: false });
  return segs;
}

export function lineDiffParts(left, right) {
  return diffLines(String(left ?? ""), String(right ?? "")).flatMap((part) => {
    const mark = part.added ? "add" : part.removed ? "del" : "same";
    return part.value
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => ({ mark, line }));
  });
}

export function diffParts(left, right, opts = {}) {
  const normalize = (value) => {
    let text = String(value ?? "");
    if (opts.ignoreWhitespace) text = text.replace(/[ \t]+/g, " ").replace(/\s+$/gm, "");
    if (opts.ignoreCase) text = text.toLocaleLowerCase();
    return text;
  };
  const before = normalize(left);
  const after = normalize(right);
  const mode = opts.mode || "lines";
  const parts = mode === "chars"
    ? diffChars(before, after)
    : mode === "words"
      ? diffWordsWithSpace(before, after)
      : diffLines(before, after);
  return parts.map((part) => ({
    mark: part.added ? "add" : part.removed ? "del" : "same",
    value: part.value,
    count: part.count || 0,
  }));
}
