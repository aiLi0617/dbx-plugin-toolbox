import { TOOL_DEFS } from "./toolCatalog.js";
import { TEXT_ACTIONS } from "./textActions.js";
import { categories, localeValues } from "./i18n.js";
import { resolveIntent } from "./searchIntent.js";

export const CATEGORY_ORDER = ["format", "encode", "convert", "text", "security", "generate", "image"];

export const LEGACY_TOOL_IDS = {
  "json-convert": "json",
  "json-yaml": "json",
  "json-csv": "json",
  "json-xml": "json",
  "json-toml": "json",
  "json-sql": "json",
  "json-ts": "json",
  jsonpath: "json",
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
  naming: "whitespace",
  case: "whitespace",
  stats: "whitespace",
  slugify: "whitespace",
  "strip-html": "whitespace",
  lines: "whitespace",
};

export function canonicalToolId(id) {
  return LEGACY_TOOL_IDS[id] || id;
}

const SUMMARIES = {
  json: { zh: "格式化、压缩、校验、树形编辑、JSONPath，以及导出 TypeScript / SQL 等", en: "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL" },
  "data-convert": { zh: "JSON / YAML / CSV / TSV / NDJSON / XML / TOML 互转", en: "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML" },
  "code-format": { zh: "格式化 SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript", en: "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript" },
  spreadsheet: { zh: "本地打开、编辑并导出 XLSX、CSV、TSV、JSON", en: "Open, edit, and export XLSX, CSV, TSV, and JSON locally" },
  base64: { zh: "Base64 / Base32 / Base58 / Hex 编码解码", en: "Encode or decode Base64, Base32, Base58, or Hex" },
  url: { zh: "URL 百分号编解码，或拆解查询参数", en: "Percent-encode/decode URLs, or list query params" },
  "html-entities": { zh: "HTML 实体、Unicode、JS、JSON、CSS 标识符转义", en: "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers" },
  "sql-escape": { zh: "按行转成 SQL 字符串字面量，可选行尾逗号", en: "Escape each line as a SQL string literal, with optional commas" },
  "data-uri": { zh: "生成或解析 Data URI，支持文本与文件", en: "Build or parse Data URIs from text or files" },
  punycode: { zh: "国际化域名（IDN）与 Punycode 互转", en: "Convert between IDN and Punycode domain names" },
  "quoted-printable": { zh: "邮件 Quoted-Printable 编码与解码", en: "Quoted-Printable encode or decode for email" },
  timestamp: { zh: "Unix 时间戳与日期互转，支持时区、加减与时间差", en: "Convert Unix timestamps and dates; timezones, arithmetic, and diffs" },
  color: { zh: "HEX / RGB / CMYK / HSV 互转，含色环与屏幕取色", en: "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker" },
  cron: { zh: "可视化编辑 Cron，并预览下次触发时间", en: "Build a cron expression and preview the next runs" },
  "base-convert": { zh: "2–36 进制互转，支持分组与前缀", en: "Convert bases 2–36, with optional grouping and prefixes" },
  "network-calc": { zh: "计算 IPv4 / IPv6 网段、掩码、主机范围并切分子网", en: "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets" },
  whitespace: { zh: "清理、去重、排序、序号、列截取、命名风格与字数统计", en: "Clean, dedupe, sort, number, extract columns, restyle names, and count text" },
  regex: { zh: "测试正则表达式，查看匹配并预览替换", en: "Test regexes, inspect matches, and preview replacements" },
  diff: { zh: "按行、单词或字符对比两段文本", en: "Compare two texts by line, word, or character" },
  markdown: { zh: "边写边预览 Markdown 渲染结果", en: "Live Markdown preview as you type" },
  "unicode-inspect": { zh: "逐字符查看 Unicode 码位与属性", en: "Inspect Unicode code points per character" },
  hash: { zh: "计算文本或文件的 MD5 / SHA / SM3 / CRC32", en: "Hash text or files with MD5, SHA, SM3, or CRC32" },
  jwt: { zh: "解码、签发或验签 JWT（HS / RS / PS）", en: "Decode, sign, or verify JWTs with HS / RS / PS" },
  aes: { zh: "AES / SM4 对称加解密（GCM / CBC / ECB）", en: "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)" },
  "hmac-sha256": { zh: "HMAC-SHA1 / SHA256 / SHA384 / SHA512 / SM3", en: "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3" },
  rsa: { zh: "RSA（OAEP / PKCS#1）或 SM2 加解密", en: "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt" },
  totp: { zh: "根据密钥生成当前 TOTP 动态口令", en: "Generate the current TOTP code from a secret" },
  cert: { zh: "查看证书有效期、SAN、指纹，或 SSH 公钥指纹", en: "Inspect cert validity, SANs, fingerprints, or SSH public keys" },
  jwk: { zh: "校验 JWK / JWKS，RSA JWK 与 PEM 互转", en: "Validate JWK/JWKS and convert RSA JWK ↔ PEM" },
  "symmetric-key": { zh: "生成 AES / SM4 / HMAC 密钥，可写入密钥库", en: "Generate an AES, SM4, or HMAC key; optional vault save" },
  "key-pair": { zh: "生成 RSA / SM2 公私钥对，可配置位数与 PEM 格式", en: "Generate RSA or SM2 key pairs; bits and PEM format options" },
  xor: { zh: "按字节异或运算，仅供调试对照", en: "XOR bytes for debugging only" },
  uuid: { zh: "批量生成 UUID、ULID 或 NanoID", en: "Generate UUID, ULID, or NanoID values" },
  password: { zh: "生成随机密码或随机十六进制字节", en: "Generate a random password or hex bytes" },
  qrcode: { zh: "生成或识别 QR / 汉信码 / PDF417 / Data Matrix", en: "Generate or decode QR, Han Xin, PDF417, and Data Matrix" },
  lorem: { zh: "按次数重复默认文案或自定义内容", en: "Repeat default or custom copy a chosen number of times" },
  "image-process": { zh: "裁剪、缩放、旋转、翻转、水印、转格式与压缩", en: "Crop, resize, rotate, flip, watermark, convert, and compress" },
  "image-generate": { zh: "按像素尺寸与目标体积生成占位图", en: "Generate placeholders at exact pixel size and file size" },
};

const catalog = TOOL_DEFS;

export const tools = catalog.map((tool) => {
  const summary = SUMMARIES[tool.id];
  const aliases = tool.id === "whitespace"
    ? [...(tool.aliases || []), ...TEXT_ACTIONS.flatMap((action) => [action.id, action.zh, action.en, ...action.aliases])]
    : tool.aliases;
  return { ...tool, ...(summary ? { summary } : {}), ...(aliases ? { aliases } : {}) };
});

export const DEFAULT_ENABLED_IDS = ["json", "base64", "timestamp", "hash", "uuid", "code-format"];

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

export function normalizeToolOrder(ids, pool = tools) {
  const byId = new Map(pool.map((tool) => [tool.id, tool]));
  const seen = new Set();
  const ordered = [];
  for (const raw of ids || []) {
    const id = canonicalToolId(raw);
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return [...ordered, ...pool.filter((tool) => !seen.has(tool.id)).map((tool) => tool.id)];
}

export function moveToolWithinCategory(order, sourceId, targetId, after = false, pool = tools) {
  if (!sourceId || sourceId === targetId) return normalizeToolOrder(order, pool);
  const byId = new Map(pool.map((tool) => [tool.id, tool]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  const next = normalizeToolOrder(order, pool);
  if (!source || !target || source.category !== target.category) return next;

  const from = next.indexOf(sourceId);
  if (from < 0) return next;
  next.splice(from, 1);
  const targetAt = next.indexOf(targetId);
  if (targetAt < 0) return normalizeToolOrder(order, pool);
  next.splice(targetAt + (after ? 1 : 0), 0, sourceId);
  return next;
}

export function toolsByCategory(pool = tools) {
  const map = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, []]));
  for (const tool of pool) map[tool.category].push(tool);
  return map;
}

export function searchTools(query, locale, pool = tools) {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  const tokens = q.split(/\s+/).filter(Boolean);
  const intentBoost = new Map();
  for (const [index, intent] of resolveIntent(q).entries()) {
    const boost = 5 + (Object.keys(intent.options || {}).length ? 1 : 0) - index * 0.01;
    const prev = intentBoost.get(intent.toolId);
    if (prev == null || boost > prev) intentBoost.set(intent.toolId, boost);
  }
  return pool.map((tool) => {
    const names = [tool.id, ...localeValues(tool.name)].map((value) => value.toLowerCase());
    const aliases = (tool.aliases || []).map((value) => value.toLowerCase());
    const category = categories[tool.category];
    const haystack = [
      ...names,
      ...aliases,
      ...localeValues(tool.summary),
      tool.category,
      ...localeValues(category),
    ].filter(Boolean).join(" ").toLowerCase();
    const matched = tokens.every((token) => haystack.includes(token));
    let score = matched ? (names.includes(q) ? 4 : aliases.includes(q) ? 3 : names.some((name) => name.includes(q)) ? 2 : 1) : 0;
    const boost = intentBoost.get(tool.id);
    if (boost != null) score = Math.max(score, boost);
    return { tool, score };
  }).filter((item) => item.score).sort((a, b) => b.score - a.score).map((item) => item.tool);
}
