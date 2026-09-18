import { convertTools } from "./tools/convert.js";
import { encodeTools } from "./tools/encode.js";
import { formatTools } from "./tools/format.js";
import { generateTools } from "./tools/generate.js";
import { textTools } from "./tools/text.js";

export const CATEGORY_ORDER = ["convert", "encode", "format", "generate", "text"];

export const LEGACY_TOOL_IDS = {
  "json-convert": "json",
  "json-yaml": "json",
  "json-csv": "json",
  "json-xml": "json",
  "json-toml": "json",
  "json-sql": "json",
  "json-ts": "json",
  duration: "timestamp",
  hex: "base64",
  base32: "base64",
  base58: "base64",
  unicode: "html-entities",
  sm4: "aes",
  "hmac-sm3": "hmac-sha256",
  sm2: "rsa",
  "ssh-fingerprint": "cert",
  sql: "code-format",
  xml: "code-format",
  yaml: "code-format",
  html: "code-format",
  css: "code-format",
  ulid: "uuid",
  nanoid: "uuid",
  "random-bytes": "password",
  crc32: "hash",
  naming: "case",
  lines: "whitespace",
};

export function canonicalToolId(id) {
  return LEGACY_TOOL_IDS[id] || id;
}

const SUMMARIES = {
  json: { zh: "格式化、压缩、校验、树形编辑，以及转成 TypeScript / SQL 等", en: "Format, minify, validate, tree-edit, and convert to TypeScript / SQL" },
  "code-format": { zh: "SQL / XML / YAML / HTML / CSS", en: "SQL, XML, YAML, HTML, CSS" },
  jsonpath: { zh: "按路径提取 JSON 节点", en: "Extract nodes with a path" },
  "base-convert": { zh: "二至三十六进制互转，可分组、加前缀", en: "Convert bases 2–36, with grouping and prefixes" },
  timestamp: { zh: "Unix 时间戳与北京时间互转", en: "Unix timestamp and Beijing time" },
  color: { zh: "HEX、RGB、CMYK、HSV、色环与屏幕取色", en: "HEX, RGB, CMYK, HSV, color wheel, and screen picker" },
  cron: { zh: "点选字段生成表达式，并列出下次触发", en: "Build a cron expression and list the next runs" },
  base64: { zh: "Base64 / 32 / 58 与 Hex", en: "Base64, 32, 58, or Hex" },
  url: { zh: "编码、解码或拆查询参数", en: "Encode, decode, or list query params" },
  "html-entities": { zh: "HTML 实体或 Unicode 转义", en: "HTML entities or Unicode escape" },
  punycode: { zh: "国际化域名编码", en: "Encode internationalized domain names" },
  "data-uri": { zh: "文本转 Data URI", en: "Turn text into a Data URI" },
  "quoted-printable": { zh: "邮件 QP 编码与解码", en: "Quoted-printable encode or decode" },
  jwt: { zh: "解码或 HS256 签发", en: "Decode or sign HS256" },
  aes: { zh: "AES / SM4 加解密", en: "AES or SM4 encrypt and decrypt" },
  "hmac-sha256": { zh: "HMAC-SHA256 或 HMAC-SM3", en: "HMAC-SHA256 or HMAC-SM3" },
  xor: { zh: "按字节异或，仅用于调试", en: "XOR bytes; debug use only" },
  rsa: { zh: "RSA OAEP / PKCS#1 或 SM2 加解密", en: "RSA OAEP/PKCS#1 or SM2" },
  cert: { zh: "解析 PEM 证书或 SSH 指纹", en: "Inspect PEM certs or SSH keys" },
  hash: { zh: "MD5 / SHA / SM3 / CRC32", en: "MD5, SHA, SM3, or CRC32" },
  uuid: { zh: "UUID / ULID / NanoID", en: "UUID, ULID, or NanoID" },
  password: { zh: "随机密码或十六进制字节", en: "Random password or hex bytes" },
  qrcode: { zh: "QR / 汉信码 / PDF417 / Data Matrix", en: "QR, Han Xin, PDF417, or Data Matrix" },
  lorem: { zh: "按语言生成固定的 DBX 推广文案，可指定行数", en: "Fixed DBX promo copy in a supported UI language, with line count" },
  totp: { zh: "从密钥计算当前口令", en: "Compute the current TOTP code" },
  whitespace: { zh: "去空行、查找替换、全半角与中英标点", en: "Trim, find/replace, fullwidth punctuation" },
  case: { zh: "大小写与 camel / snake / kebab", en: "Letter case and identifier style" },
  stats: { zh: "字、词、行、字节统计", en: "Count chars, words, lines, bytes" },
  regex: { zh: "测试正则并列出匹配", en: "Test a regex and list matches" },
  diff: { zh: "对比两段文本的行差异", en: "Line-level diff of two texts" },
  markdown: { zh: "边写边渲染 Markdown", en: "Live Markdown preview" },
  slugify: { zh: "生成 URL 友好片段", en: "Make a URL-friendly slug" },
  "strip-html": { zh: "去掉 HTML 标签留文本", en: "Remove tags, keep the text" },
  "sql-escape": { zh: "按行转成 SQL 字符串，可选行尾逗号", en: "Escape each line as a SQL string, with optional commas" },
  "unicode-inspect": { zh: "查看每个字符的码位", en: "Inspect code points per character" },
  "symmetric-key": { zh: "生成 AES / SM4 / HMAC 单钥，可写入密钥库", en: "Generate an AES, SM4, or HMAC key; optional vault save" },
  "key-pair": { zh: "生成 RSA / SM2 公钥和私钥，RSA 可选位数和 PEM 格式", en: "Generate RSA or SM2 public/private keys; RSA bits and PEM format" },
};

const catalog = [...convertTools, ...encodeTools, ...formatTools, ...generateTools, ...textTools];

export const tools = catalog.map((tool) => {
  const summary = SUMMARIES[tool.id];
  return summary ? { ...tool, summary } : tool;
});

export const DEFAULT_ENABLED_IDS = ["json", "base64", "code-format", "hash", "uuid", "color"];

export function toolsByIds(ids) {
  const map = new Map(tools.map((tool) => [tool.id, tool]));
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = canonicalToolId(raw);
    const tool = map.get(id);
    if (!tool || seen.has(id)) continue;
    seen.add(id);
    out.push(tool);
  }
  return out;
}

export function toolsByCategory(pool = tools) {
  const map = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, []]));
  for (const tool of pool) map[tool.category].push(tool);
  return map;
}

export function searchTools(query, locale, pool = tools) {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  return pool.filter((tool) => {
    const zh = tool.name.zh.toLowerCase();
    const en = tool.name.en.toLowerCase();
    const summaryZh = tool.summary?.zh?.toLowerCase() || "";
    const summaryEn = tool.summary?.en?.toLowerCase() || "";
    const aliases = (tool.aliases || []).join(" ").toLowerCase();
    return (
      tool.id.includes(q) ||
      zh.includes(q) ||
      en.includes(q) ||
      summaryZh.includes(q) ||
      summaryEn.includes(q) ||
      aliases.includes(q) ||
      tool.category.includes(q)
    );
  });
}
