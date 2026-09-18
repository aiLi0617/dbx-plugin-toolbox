import { diffLines } from "diff";
import { marked } from "marked";

export function toCase(text, mode) {
  if (mode === "upper") return text.toUpperCase();
  if (mode === "lower") return text.toLowerCase();
  if (mode === "title") return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
  return text;
}

export function naming(text, style) {
  const parts = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
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
  const chars = [...value].length;
  const bytes = new TextEncoder().encode(value).length;
  const words = countWords(value);
  const lines = value ? value.split(/\r?\n/).length : 0;
  return { chars, bytes, words, lines };
}

export function lineOps(text, mode, affix) {
  let lines = text.split(/\r?\n/);
  if (mode === "sort") lines = [...lines].sort((a, b) => a.localeCompare(b));
  if (mode === "unique") lines = [...new Set(lines)];
  if (mode === "prefix") lines = lines.map((l) => (affix || "") + l);
  if (mode === "suffix") lines = lines.map((l) => l + (affix || ""));
  if (mode === "reverse") lines = [...lines].reverse();
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

export function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHtml(text) {
  return text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "");
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
  A: new Set(["href", "title", "rel"]),
  IMG: new Set(["src", "alt", "title"]),
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
  if (kind === "img") return /^(https?:|data:image\/)/i.test(url) ? url : "";
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
    } else {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
      }
      el.remove();
    }
  } else if (tag === "IMG") {
    const src = safeUrl(el.getAttribute("src"), "img");
    if (src) el.setAttribute("src", src);
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
  if (["sort", "unique", "prefix", "suffix", "reverse"].includes(kind)) {
    return lineOps(text, kind, options.affix);
  }
  return whitespace(text, kind);
}

export function findReplace(text, find, replace) {
  if (!find) return text;
  return String(text ?? "").split(find).join(replace || "");
}

export function testRegex(input, pattern, flags) {
  const re = new RegExp(pattern || ".*", flags || "");
  const text = String(input ?? "");
  const matches = [];
  if (re.global) {
    for (const m of text.matchAll(re)) {
      matches.push({ index: m.index ?? 0, text: m[0], groups: m.slice(1) });
      if (!m[0]) break;
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

export const textTools = [
  {
    id: "whitespace",
    category: "text",
    phase: "p0",
    name: { zh: "文本整理", en: "Text cleanup" },
    aliases: ["空白与行", "查找替换", "全半角"],
    view: "whitespace",
  },
  {
    id: "case",
    category: "text",
    phase: "p0",
    name: { zh: "大小写与命名", en: "Case & naming" },
    aliases: ["naming"],
    view: "case",
  },
  {
    id: "stats",
    category: "text",
    phase: "p0",
    name: { zh: "字数统计", en: "Word count" },
    view: "stats",
  },
  {
    id: "regex",
    category: "text",
    phase: "p0",
    name: { zh: "Regex 测试", en: "Regex tester" },
    view: "regex",
  },
  {
    id: "diff",
    category: "text",
    phase: "p0",
    name: { zh: "行级 Diff", en: "Line diff" },
    view: "diff",
  },
  {
    id: "markdown",
    category: "text",
    phase: "p0",
    name: { zh: "Markdown 预览", en: "Markdown preview" },
    view: "markdown",
  },
  {
    id: "slugify",
    category: "text",
    phase: "p1",
    name: { zh: "Slugify", en: "Slugify" },
    view: "live-io",
  },
  {
    id: "strip-html",
    category: "text",
    phase: "p1",
    name: { zh: "去 HTML 标签", en: "Strip HTML" },
    view: "live-io",
  },
  {
    id: "unicode-inspect",
    category: "text",
    phase: "p1",
    name: { zh: "Unicode 码位检查器", en: "Unicode inspector" },
    view: "unicode-inspect",
  },
];
