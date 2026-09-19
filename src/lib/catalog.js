import { TOOL_DEFS } from "./toolCatalog.js";
import { TEXT_ACTIONS } from "./textActions.js";
import { categories } from "./i18n.js";

export const CATEGORY_ORDER = ["convert", "encode", "format", "image", "security", "generate", "text"];

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
  "data-convert": { zh: "JSON、YAML、CSV、TSV、NDJSON、XML、TOML 双向转换", en: "Convert between JSON, YAML, CSV, TSV, NDJSON, XML, and TOML" },
  spreadsheet: { zh: "本地打开、编辑和导出 XLSX、CSV、TSV、JSON", en: "Open, edit, and export XLSX, CSV, TSV, and JSON locally" },
  "image-process": { zh: "裁剪、缩放、旋转、翻转、水印、格式转换与质量压缩", en: "Crop, resize, rotate, flip, watermark, convert, and compress images" },
  json: { zh: "格式化、压缩、校验、树形编辑，以及转成 TypeScript / SQL 等", en: "Format, minify, validate, tree-edit, and convert to TypeScript / SQL" },
  "code-format": { zh: "SQL / XML / YAML / HTML / CSS / JavaScript / TypeScript", en: "SQL, XML, YAML, HTML, CSS, JavaScript, TypeScript" },
  jsonpath: { zh: "按路径提取 JSON 节点", en: "Extract nodes with a path" },
  "base-convert": { zh: "二至三十六进制互转，可分组、加前缀", en: "Convert bases 2–36, with grouping and prefixes" },
  "network-calc": { zh: "计算 IPv4 / IPv6 网段、掩码、范围并切分子网", en: "Calculate IPv4/IPv6 networks and ranges, then split subnets" },
  timestamp: { zh: "Unix 时间戳与北京时间互转", en: "Convert Unix timestamps and Beijing time" },
  color: { zh: "HEX、RGB、CMYK、HSV、色环与屏幕取色", en: "HEX, RGB, CMYK, HSV, color wheel, and screen picker" },
  cron: { zh: "点选字段生成表达式，并列出下次触发", en: "Build a cron expression and list the next runs" },
  base64: { zh: "Base64 / 32 / 58 与 Hex", en: "Base64, 32, 58, or Hex" },
  url: { zh: "编码、解码或拆查询参数", en: "Encode, decode, or list query params" },
  "html-entities": { zh: "HTML 实体或 Unicode 转义", en: "HTML entities or Unicode escape" },
  punycode: { zh: "国际化域名编码", en: "Encode internationalized domain names" },
  "data-uri": { zh: "生成或解析 Data URI，支持文件", en: "Create or parse Data URIs, including files" },
  "quoted-printable": { zh: "邮件 QP 编码与解码", en: "Quoted-printable encode or decode" },
  jwt: { zh: "解码及 HS / RS / PS 签发与验签", en: "Decode, sign, or verify with HS / RS / PS" },
  aes: { zh: "AES / SM4 加解密", en: "AES or SM4 encrypt and decrypt" },
  "hmac-sha256": { zh: "HMAC-SHA256 或 HMAC-SM3", en: "HMAC-SHA256 or HMAC-SM3" },
  xor: { zh: "按字节异或，仅用于调试", en: "XOR bytes; debug use only" },
  rsa: { zh: "RSA OAEP / PKCS#1 或 SM2 加解密", en: "RSA OAEP/PKCS#1 or SM2" },
  jwk: { zh: "校验 JWK / JWKS，并在 RSA JWK 与 PEM 间转换", en: "Validate JWK / JWKS and convert RSA JWK to or from PEM" },
  cert: { zh: "检查证书有效期、SAN、指纹或 SSH 公钥", en: "Inspect certificate validity, SANs, fingerprints, or SSH keys" },
  hash: { zh: "计算文本或文件的 MD5 / SHA / SM3 / CRC32", en: "Hash text or files with MD5, SHA, SM3, or CRC32" },
  uuid: { zh: "UUID / ULID / NanoID", en: "UUID, ULID, or NanoID" },
  password: { zh: "随机密码或十六进制字节", en: "Random password or hex bytes" },
  qrcode: { zh: "生成 QR / 汉信码 / PDF417 / Data Matrix；识别 QR / Data Matrix / PDF417 图片", en: "Generate QR, Han Xin, PDF417, or Data Matrix; decode QR, Data Matrix, and PDF417 images" },
  lorem: { zh: "重复生成默认 DBX 文案或自定义内容，可指定数量", en: "Repeat default DBX copy or custom content with a chosen count" },
  totp: { zh: "从密钥计算当前口令", en: "Compute the current TOTP code" },
  whitespace: { zh: "清理、排序、序号、列截取、长度过滤、命名转换与字数统计", en: "Clean, sort, number, extract columns, filter lengths, convert naming styles, and count text" },
  case: { zh: "大小写与 camel / snake / kebab", en: "Letter case and identifier style" },
  stats: { zh: "字、词、行、字节统计", en: "Count chars, words, lines, bytes" },
  regex: { zh: "测试正则、列出匹配并预览替换", en: "Test regexes, inspect matches, and preview replacements" },
  diff: { zh: "按行、单词或字符对比文本", en: "Compare text by line, word, or character" },
  markdown: { zh: "边写边渲染 Markdown", en: "Live Markdown preview" },
  slugify: { zh: "生成 URL 友好片段", en: "Make a URL-friendly slug" },
  "strip-html": { zh: "去掉 HTML 标签留文本", en: "Remove tags, keep the text" },
  "sql-escape": { zh: "按行转成 SQL 字符串，可选行尾逗号", en: "Escape each line as a SQL string, with optional commas" },
  "unicode-inspect": { zh: "查看每个字符的码位", en: "Inspect code points per character" },
  "symmetric-key": { zh: "生成 AES / SM4 / HMAC 单钥，可写入密钥库", en: "Generate an AES, SM4, or HMAC key; optional vault save" },
  "key-pair": { zh: "生成 RSA / SM2 公钥和私钥，RSA 可选位数和 PEM 格式", en: "Generate RSA or SM2 public/private keys; RSA bits and PEM format" },
};

const catalog = TOOL_DEFS;

export const tools = catalog.map((tool) => {
  const summary = SUMMARIES[tool.id];
  const aliases = tool.id === "whitespace"
    ? [...(tool.aliases || []), ...TEXT_ACTIONS.flatMap((action) => [action.id, action.zh, action.en, ...action.aliases])]
    : tool.aliases;
  return { ...tool, ...(summary ? { summary } : {}), ...(aliases ? { aliases } : {}) };
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
  return pool.map((tool) => {
    const names = [tool.id, tool.name.zh, tool.name.en].map((value) => value.toLowerCase());
    const aliases = (tool.aliases || []).map((value) => value.toLowerCase());
    const category = categories[tool.category];
    const haystack = [...names, ...aliases, tool.summary?.zh, tool.summary?.en, tool.category, category?.zh, category?.en].filter(Boolean).join(" ").toLowerCase();
    const score = names.includes(q) ? 4 : aliases.includes(q) ? 3 : names.some((name) => name.includes(q)) ? 2 : 1;
    return { tool, score: tokens.every((token) => haystack.includes(token)) ? score : 0 };
  }).filter((item) => item.score).sort((a, b) => b.score - a.score).map((item) => item.tool);
}
